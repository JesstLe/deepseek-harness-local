/** Read-only capability inspection. Never infers endpoint capabilities from a model name. */
export async function inspectCuaImageAdmission(ctx,agent,signal){
 const config=agent?.session?.requestHeader?.()?.config??{},provider=config.provider??agent?.options?.provider,model=config.model??agent?.options?.model;
 const store=ctx.get?.('attachments'),llm=ctx.get?.('llm');
 const result={ready:false,provider:provider??null,model:model??null,inputModalities:null,attachmentsReady:typeof store?.saveImages==='function',reasonCode:null};
 if(!provider||!model||!llm){result.reasonCode='CUA_MODEL_ROUTE_REQUIRED';return result;}
 let info;try{info=await llm.resolveModelInfo(provider,model,signal);}catch(error){signal?.throwIfAborted();result.reasonCode='CUA_MODEL_METADATA_UNAVAILABLE';return result;}
 signal?.throwIfAborted();result.inputModalities=Array.isArray(info?.inputModalities)?[...info.inputModalities]:null;
 if(!result.inputModalities?.includes('image')){result.reasonCode='CUA_MODEL_IMAGE_INPUT_REQUIRED';return result;}
 if(!result.attachmentsReady){result.reasonCode='CUA_ATTACHMENT_STORE_REQUIRED';return result;}
 result.ready=true;return result;
}
export function requireCuaImageAdmission(value){
 if(value.ready)return;
 const messages={CUA_MODEL_ROUTE_REQUIRED:'当前会话的模型路由未就绪。',CUA_MODEL_METADATA_UNAVAILABLE:'当前供应商的模型能力信息尚未就绪。',CUA_MODEL_IMAGE_INPUT_REQUIRED:'当前模型连接未声明图像输入。请在设置 → 模型配置中核对该通道，并将已支持视觉的型号设为“文本 + 图像”；模型名称相同不代表代理通道已声明此能力。',CUA_ATTACHMENT_STORE_REQUIRED:'当前会话的原生图片附件服务未就绪。'};
 throw Object.assign(Error(value.reasonCode+': '+messages[value.reasonCode]+' '+JSON.stringify({provider:value.provider,model:value.model,inputModalities:value.inputModalities,attachmentsReady:value.attachmentsReady})),{code:value.reasonCode});
}
