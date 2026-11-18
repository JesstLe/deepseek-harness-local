import {PRODUCT_TEMPLATE_KEYS} from './product-copy-keys.js';
/** Only product-owned UI dictionary keys cross this boundary. User content,
 * model names/IDs, tool output, file contents and arbitrary parameters never do.
 * Native bindings call locale.translate dynamically in the pinned runtime.
 */
export const PRODUCT_COPY_KEYS=Object.freeze({
 ...Object.fromEntries(Object.entries(PRODUCT_TEMPLATE_KEYS).map(([ns,keys])=>[ns,new Set(keys)])),
 chat:new Set([...(PRODUCT_TEMPLATE_KEYS.chat??[]),'chat.deepDiving','chat.deepDivingFor','message.failure.accountSignedOut','message.failure.accountSignInRequired']),
 pluginManager:new Set([...(PRODUCT_TEMPLATE_KEYS.pluginManager??[]),'installGuideSafety']),
 sidebarOffice:new Set([...(PRODUCT_TEMPLATE_KEYS.sidebarOffice??[]),'unavailable']),
 settings:new Set(['general.currentVersion']),
 model:new Set([...(PRODUCT_TEMPLATE_KEYS.model??[]),'provider.account','error.sessionInUse']),
});
const retiredAccount={zh:'旧账号模型（未配置）',en:'Legacy account model (unconfigured)',ja:'旧アカウントモデル（未設定）',es:'Modelo de cuenta anterior (sin configurar)',fr:'Ancien modèle de compte (non configuré)',de:'Altes Kontomodell (nicht konfiguriert)',ru:'Старая модель аккаунта (не настроена)',pt:'Modelo de conta anterior (não configurado)'};
const connectionCopy={
 zh:'模型连接已失效，请在设置中更新 API Key。',
 en:'The model connection is no longer valid. Update its API Key in Settings.',
 ja:'モデル接続が無効です。設定で API Key を更新してください。',
 es:'La conexión del modelo ya no es válida. Actualiza su API Key en Ajustes.',
 fr:'La connexion au modèle est invalide. Mettez à jour sa clé API dans les paramètres.',
 de:'Die Modellverbindung ist ungültig. Aktualisiere den API Key in den Einstellungen.',
 ru:'Подключение к модели недействительно. Обновите API Key в настройках.',
 pt:'A conexão do modelo não é mais válida. Atualize sua API Key nas configurações.',
};
export function productCopy(namespace,key,template,locale,version){
 if(!PRODUCT_COPY_KEYS[namespace]?.has(key))return template;
 if(namespace==='model'&&key==='provider.account')return retiredAccount[String(locale).split('-')[0]]??retiredAccount.en;
 if(namespace==='settings')return 'Naumi '+version;
 if(namespace==='chat'&&key.startsWith('message.failure.'))return connectionCopy[String(locale).split('-')[0]]??connectionCopy.en;
 return template.replace(/DeepSeek Harness/g,'Naumi').replace(/深度求索中/g,'Naumi 正在处理').replace(/\bDSH\b/g,'Naumi');
}
export function installProductIdentity(ctx,{version='0.3.2'}={}){
 const native=globalThis.naumiDesktop?.appVersion;if(typeof native==='string'&&/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(native))version=native;
 const locale=ctx.locale,original=locale.translate,own=Object.getOwnPropertyDescriptor(locale,'translate');
 function translate(namespace,key,params){
  const template=original.call(this,namespace,key);
  const text=productCopy(namespace,key,template,this.getSnapshot().active,version);
  if(!params)return text;
  return text.replace(/\{(\w+)\}/g,(match,name)=>name in params?String(params[name]):match);
 }
 Object.defineProperty(locale,'translate',{configurable:true,writable:true,value:translate});
 return()=>{if(locale.translate!==translate)return;if(own)Object.defineProperty(locale,'translate',own);else delete locale.translate;};
}
