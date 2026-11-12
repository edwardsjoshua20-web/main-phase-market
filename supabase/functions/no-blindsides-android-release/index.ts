import {handleCors} from '../_shared/cors.ts';
import {errorResponse,jsonResponse} from '../_shared/http.ts';
const URL_ROOT=Deno.env.get('SUPABASE_URL')?.replace(/\/+$/,'')||'';
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const BUCKET='no-blindsides-android-releases';
const headers=(extra:Record<string,string>={})=>({apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':'application/json',...extra});
async function current(){
 const query=new URLSearchParams({select:'application_id,version_code,version_name,release_date,storage_path,file_name,sha256,size_bytes,release_notes',is_current:'eq.true',limit:'1'});
 const response=await fetch(`${URL_ROOT}/rest/v1/no_blindsides_android_releases?${query}`,{headers:headers()});
 if(!response.ok)throw new Error('LOOKUP_FAILED');const rows=await response.json();if(!Array.isArray(rows)||!rows[0])throw new Error('NOT_FOUND');return rows[0];
}
const view=(row:Record<string,unknown>)=>({applicationId:row.application_id,versionCode:row.version_code,versionName:row.version_name,releaseDate:row.release_date,fileName:row.file_name,sha256:row.sha256,sizeBytes:row.size_bytes,notes:row.release_notes});
async function signed(row:Record<string,unknown>){
 const path=String(row.storage_path||'').split('/').map(encodeURIComponent).join('/');
 const response=await fetch(`${URL_ROOT}/storage/v1/object/sign/${BUCKET}/${path}`,{method:'POST',headers:headers(),body:JSON.stringify({expiresIn:300})});
 if(!response.ok)throw new Error('SIGN_FAILED');const payload=await response.json();const signedPath=String(payload?.signedURL||payload?.signedUrl||'');if(!signedPath)throw new Error('SIGN_FAILED');
 return{...view(row),signedUrl:signedPath.startsWith('http')?signedPath:`${URL_ROOT}/storage/v1${signedPath}`,expiresInSeconds:300};
}
Deno.serve(async request=>{const cors=handleCors(request);if(cors)return cors;if(request.method!=='POST')return errorResponse('Only POST is supported.',405);if(!URL_ROOT||!SERVICE_KEY)return errorResponse('Android releases are not configured.',503);try{const body=await request.json().catch(()=>({})),action=String(body?.action||'metadata'),release=await current();if(action==='metadata')return jsonResponse({release:view(release)});if(action==='download')return jsonResponse({release:await signed(release)});return errorResponse('Unsupported release action.',400)}catch(error){const code=error instanceof Error?error.message:'UNKNOWN';if(code==='NOT_FOUND')return errorResponse('No Android release is published yet.',404);return errorResponse('The Android release is temporarily unavailable.',500)}});
