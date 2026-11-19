'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('browserManager',{request:value=>ipcRenderer.invoke('naumi:browser-control',value)});
