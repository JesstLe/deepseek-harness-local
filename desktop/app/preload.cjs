'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const subscribe=(channel,listener)=>{const handler=(_event,value)=>listener(value);ipcRenderer.on(channel,handler);return()=>ipcRenderer.removeListener(channel,handler);};
const browser={
  acquire:workspace=>ipcRenderer.invoke('naumi:browser-acquire',workspace),
  release:lease=>ipcRenderer.invoke('naumi:browser-release',lease),
  onOpenRequested:(lease,listener)=>subscribe('naumi:browser-open',value=>{if(value?.lease===lease)listener(value.url);})
};
contextBridge.exposeInMainWorld('dshDesktop',{protocolVersion:1,browser});
contextBridge.exposeInMainWorld('naumiDesktop',{
  version:1,engine:'chromium',
  bindBrowser:value=>ipcRenderer.invoke('naumi:browser-bind',value),
  onBrowserIssue:listener=>subscribe('naumi:browser-issue',listener),
  onToolRequest:listener=>subscribe('naumi:browser-tool-request',listener),
  retry:()=>ipcRenderer.invoke('naumi:retry'),
  product:'Naumi'
});
