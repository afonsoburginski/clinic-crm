import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { query } from "../infrastructure/database"

export type Role = "admin" | "reception" | "professional" | "finance" | "manager"
export type User = { id: string; name: string; email: string; roles: Role[]; professionalId?: string }
const grants: Record<Role, string[]> = {
 admin:["dashboard:read","patients:read","patients:write","guardians:write","appointments:read","appointments:write","appointments:cancel","professionals:manage","services:manage","rooms:manage","settings:manage","audit:read","finance:read","team:invite","documents:read"],
 reception:["dashboard:read","patients:read","patients:write","guardians:write","appointments:read","appointments:write","appointments:cancel","documents:read"],
 professional:["dashboard:read","patients:read-own","appointments:read-own","appointments:status-own","clinical:read","clinical:write","assessments:interpret","documents:read"],
 finance:["dashboard:read","patients:read","appointments:read","finance:read","finance:write","documents:read"],
 manager:["dashboard:read","appointments:read","professionals:manage","audit:read"]
}
export function hasPermission(user: User, permission: string) { return user.roles.some(role => grants[role]?.includes(permission)) }
type Provisioned = User & { passwordHash: string }
function config() {
 const secret=Bun.env.AUTH_SESSION_SECRET, raw=Bun.env.AUTH_USERS_JSON
 if(!secret||secret.length<32||!raw) return null
 try { const users=JSON.parse(raw) as Provisioned[]; if(!Array.isArray(users)||users.some(u=>!u.id||!u.email||!u.passwordHash||!Array.isArray(u.roles)||u.roles.some(r=>!grants[r]))) return null; return {secret,users} } catch { return null }
}
const digest=(s:string)=>createHash("sha256").update(s).digest("hex")
export async function login(email:string,password:string) {
 const cfg=config(); if(!cfg)throw new Error("auth_unconfigured")
 const key=digest(email.trim().toLowerCase())
 const lock=await query<{locked_until:Date|null;failures:number}>("SELECT locked_until,failures FROM auth_login_lockouts WHERE email_hash=$1",[key])
 if(lock.rows[0]?.locked_until && new Date(lock.rows[0].locked_until)>new Date())throw new Error("login_locked")
 const found=cfg.users.find(u=>u.email.toLowerCase()===email.trim().toLowerCase())
 const valid=found?await Bun.password.verify(password,found.passwordHash):await Bun.password.verify(password,"$2b$10$abcdefghijklmnopqrstuuCwQvM5sN6q.XjMJ7Z6n9L6kG8VPRU9a")
 if(!valid||!found){await query("INSERT INTO auth_login_lockouts(email_hash,failures,window_started_at,locked_until) VALUES($1,1,now(),NULL) ON CONFLICT(email_hash) DO UPDATE SET failures=CASE WHEN auth_login_lockouts.window_started_at<now()-interval '5 minutes' THEN 1 ELSE auth_login_lockouts.failures+1 END,window_started_at=CASE WHEN auth_login_lockouts.window_started_at<now()-interval '5 minutes' THEN now() ELSE auth_login_lockouts.window_started_at END,locked_until=CASE WHEN auth_login_lockouts.window_started_at<now()-interval '5 minutes' THEN NULL WHEN auth_login_lockouts.failures+1>=5 THEN now()+interval '5 minutes' ELSE NULL END",[key]);throw new Error("invalid_credentials")}
 await query("DELETE FROM auth_login_lockouts WHERE email_hash=$1",[key])
 const token=randomBytes(32).toString("base64url"), tokenHash=digest(token), expires=new Date(Date.now()+12*60*60*1000)
 const user:User={id:found.id,name:found.name,email:found.email,roles:found.roles,professionalId:found.professionalId}
 const signature=createHmac("sha256",cfg.secret).update(token).digest("base64url")
 await query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)",[tokenHash,user.id,expires])
 return {user,accessToken:`${token}.${signature}`,expiresAt:expires.toISOString()}
}
export async function session(token:string) {
 const cfg=config();if(!cfg)throw new Error("auth_unconfigured")
 const [raw,sig,...rest]=token.split(".");if(!raw||!sig||rest.length)throw new Error("unauthorized")
 const expected=createHmac("sha256",cfg.secret).update(raw).digest("base64url")
 if(sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))throw new Error("unauthorized")
 const r=await query<{user_id:string}>("SELECT user_id FROM auth_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()",[digest(raw)])
 const user=cfg.users.find(u=>u.id===r.rows[0]?.user_id);if(!user)throw new Error("unauthorized")
 return {id:user.id,name:user.name,email:user.email,roles:user.roles,professionalId:user.professionalId} satisfies User
}
export async function logout(token:string) { const raw=token.split(".")[0];if(raw)await query("UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL",[digest(raw)]) }
export function permissionFor(path:string,method:string) {
 const p=path.replace(/\/$/,"");
 if(p==="/api/v1/auth/login"||p==="/api/v1/auth/session"||p==="/api/v1/auth/logout")return null;
 if(/^\/api\/v1\/(clinical(?:-records(?:\/[^/]+(?:\/(?:finalize|rectifications|versions))?)?|\/patients)|assessments(?:\/[^/]+(?:\/(?:stages|interpretations|complete|cancel))?)?|aba\/(?:plans(?:\/[^/]+(?:\/(?:activate|close|goals(?:\/[^/]+)?))?)?|sessions(?:\/[^/]+\/void)?))$/.test(p))return method==="GET"?"clinical:read":"clinical:write";
 if(/^\/api\/v1\/financial\/(?:entries(?:\/[^/]+(?:\/(?:payments|cancel))?)?|payments\/[^/]+\/reverse|summary)$/.test(p))return method==="GET"?"finance:read":"finance:write";
 if(/^\/api\/v1\/documents(?:\/[^/]+(?:\/(?:status|releases(?:\/[^/]+\/revoke)?))?)?$/.test(p))return method==="GET"?"documents:read":"documents:write";
 if(p==="/api/v1/settings")return "settings:manage";
 if(p==="/api/v1/audit")return "audit:read";
 if(/^\/api\/v1\/(?:professionals(?:\/[^/]+(?:\/(?:schedule|unavailabilities(?:\/[^/]+)?))?)?|specialties(?:\/[^/]+)?|services(?:\/[^/]+)?|rooms(?:\/[^/]+)?)$/.test(p))return "professionals:manage";
 if(/^\/api\/v1\/appointments(?:\/[^/]+(?:\/(?:transitions|status))?)?$/.test(p)||p==="/api/v1/appointments/suggestions")return method==="GET"?"appointments:read":"appointments:write";
 if(/^\/api\/v1\/(?:patients(?:\/[^/]+(?:\/appointments)?)?|guardians(?:\/[^/]+)?|patient-guardians(?:\/[^/]+)?)$/.test(p))return method==="GET"?"patients:read":"patients:write";
 if(p==="/api/v1/dashboard/summary")return "dashboard:read";
 return null
}
