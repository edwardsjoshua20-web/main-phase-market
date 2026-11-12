const endpoint='https://wwvvyrhlybwijqlhubdv.supabase.co/functions/v1/no-blindsides-android-release';
async function request(action){
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action}),cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload?.release)throw new Error(payload?.error||'The No Blindsides release service is unavailable.');
  return payload.release;
}
export const noBlindsidesReleaseApi={metadata:()=>request('metadata'),download:()=>request('download')};
