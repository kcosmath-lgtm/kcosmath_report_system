"use client";
import {useState} from "react";import Image from "next/image";import Link from "next/link";
import {Building2,Camera,Check,LogOut,Save,ShieldCheck,UserRound} from "lucide-react";
import logo from "../../../public/logo.png";import LandingMenu from "../../components/LandingMenu";import {useAuth} from "../../components/AuthProvider";import styles from "./settings.module.css";

import AcademyRequests from "../../components/AcademyRequests";

export default function SettingsPage(){
 const {user,workspace,signOut,updateProfile,uploadAvatar}=useAuth();
 const [name,setName]=useState(()=>user?.user_metadata?.full_name||""),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
 const avatarUrl=user?.user_metadata?.avatar_url as string|undefined;
 async function saveProfile(){if(!name.trim())return;setSaving(true);setMessage("");const error=await updateProfile(name);setMessage(error||"프로필을 저장했습니다.");setSaving(false)}
 async function changeAvatar(file?:File){if(!file)return;setSaving(true);setMessage("");const error=await uploadAvatar(file);setMessage(error||"프로필 사진을 저장했습니다.");setSaving(false)}
 return <main className={styles.page}><header><div className={styles.identity}><Link href="/"><Image src={logo} alt="COSMATH" priority/></Link><span><UserRound size={17}/> 설정</span></div><LandingMenu/></header>
 <div className={styles.shell}><aside className={styles.settingsNav}><p>SETTINGS</p><h1>프로필 설정</h1><nav><a href="#profile" className={styles.active}><UserRound/> 프로필</a>{workspace?.role === "owner" && <a href="#requests"><Building2/> 강사 가입 요청</a>}<a href="#security"><ShieldCheck/> 계정 및 보안</a></nav></aside>
 <section className={styles.content}><div className={styles.summary}><div className={styles.avatar}>{avatarUrl?<Image src={avatarUrl} alt="프로필 사진" width={54} height={54} unoptimized/>:<Building2/>}</div><div><h2>{user?.user_metadata?.full_name||user?.email?.split("@")[0]}</h2><span>{user?.email}</span></div></div>
 <section id="profile" className={styles.section}><div className={styles.sectionHead}><div><p>PROFILE</p><h2>프로필</h2></div><UserRound/></div><div className={styles.photoRow}><div className={styles.largeAvatar}>{avatarUrl?<Image src={avatarUrl} alt="프로필 사진" width={72} height={72} unoptimized/>:<Building2/>}</div><label className={styles.photoButton}><Camera/> 사진 변경<input type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={e=>void changeAvatar(e.target.files?.[0])}/></label><small>JPG, PNG, WebP · 최대 2MB</small></div><div className={styles.formRow}><label>표시 이름<input value={name} maxLength={60} onChange={e=>setName(e.target.value)} placeholder="이름을 입력하세요"/></label><label>이메일<input value={user?.email||""} disabled/></label></div><div className={styles.actions}>{message&&<span className={message.includes("저장")?styles.success:styles.error}>{message.includes("저장")&&<Check/>}{message}</span>}<button disabled={saving||!name.trim()} onClick={()=>void saveProfile()}><Save/> 저장</button></div></section>
 {workspace?.role === "owner" && <AcademyRequests/>}
 <section id="security" className={styles.section}><div className={styles.sectionHead}><div><p>ACCOUNT</p><h2>계정 및 보안</h2></div><ShieldCheck/></div><dl><div><dt>로그인 방식</dt><dd>Google</dd></div><div><dt>로그인 계정</dt><dd>{user?.email}</dd></div></dl><button className={styles.logout} onClick={()=>void signOut()}><LogOut/> 로그아웃</button></section>
 </section></div></main>
}
