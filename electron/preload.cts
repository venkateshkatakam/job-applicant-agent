import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../shared/types.js';

const api: DesktopAPI = {
  load: () => ipcRenderer.invoke('state:load'),
  savePreferences: preferences => ipcRenderer.invoke('preferences:save', preferences),
  importResumes: () => ipcRenderer.invoke('resumes:import'),
  removeResume: id => ipcRenderer.invoke('resumes:remove', id),
  importJobs: () => ipcRenderer.invoke('jobs:import'),
  reextractJobs: () => ipcRenderer.invoke('jobs:reextract'),
  addJob: text => ipcRenderer.invoke('jobs:add', text),
  updateJob: (id, fields) => ipcRenderer.invoke('jobs:update', id, fields),
  deleteJob: id => ipcRenderer.invoke('jobs:delete', id),
  removeJobDocument: source => ipcRenderer.invoke('jobs:remove-document', source),
  importOAuth: () => ipcRenderer.invoke('gmail:credentials'),
  openGoogleSetup: step => ipcRenderer.invoke('gmail:setup', step),
  connect: clientId => ipcRenderer.invoke('gmail:connect', clientId),
  cancelSignIn: () => ipcRenderer.invoke('gmail:cancel'),
  disconnect: () => ipcRenderer.invoke('gmail:disconnect'),
  fetchEmails: query => ipcRenderer.invoke('gmail:fetch', query),
  preview: id => ipcRenderer.invoke('draft:preview', id),
  createDrafts: ids => ipcRenderer.invoke('draft:create', ids),
  openDrafts: () => ipcRenderer.invoke('gmail:open'),
};
contextBridge.exposeInMainWorld('applicant', api);