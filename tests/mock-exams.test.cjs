const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const catalog = require('../src/data/mock-exams.json');

test('catalog covers every entry returned by each official grade list', () => {
  assert.equal(new Set(catalog.exams.map(exam => exam.id)).size, catalog.exams.length);
  for (const { grade, expected } of catalog.coverage) {
    const exams = catalog.exams.filter(exam => exam.grade === grade);
    assert.equal(exams.length, expected);
    assert.ok(exams.some(exam => exam.year === 2006));
    assert.ok(exams.some(exam => exam.year === 2026));
    for (const exam of exams) {
      assert.ok(exam.resources.some(resource => resource.kind === 'problem'));
      assert.ok(exam.month >= 1 && exam.month <= 12);
      assert.ok(exam.subject);
    }
  }
});

test('stored resources are intact, content-addressed files with matching sizes', () => {
  const seen = new Set();
  for (const resource of catalog.exams.flatMap(exam => exam.resources)) {
    assert.equal(new URL(resource.url).hostname, 'wdown.ebsi.co.kr');
    assert.equal(new URL(resource.url).protocol, 'https:');
    assert.ok(resource.localPath, `Missing original: ${resource.url}`);
    if (seen.has(resource.localPath)) continue;
    seen.add(resource.localPath);
    assert.match(resource.localPath, /^\/question-bank\/files\/[a-f0-9]{64}\.(pdf|png|jpg)$/);
    const bytes = fs.readFileSync(path.join(__dirname, '../public', resource.localPath));
    assert.equal(bytes.length, resource.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), resource.sha256);
  }
  assert.ok(seen.size > 0);
});
