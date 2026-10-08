"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, Clock3, Copy, Eye, File, FileArchive, FileImage, FileText, Folder, FolderPlus, Link2, LockKeyhole, MoreHorizontal, Plus, Search, ShieldCheck, Trash2, UnlockKeyhole, X } from "lucide-react";

type SharedFile = { id: string; name: string; size: number; contentType: string; folderId: string | null; createdAt: string; protected: boolean; ownerKey?: string };
type FolderItem = { id: string; name: string; parentId: string | null; createdAt: string; protected: boolean; ownerKey?: string };
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const ownerStorageKey = (kind: "file" | "folder", id: string) => `folio-owner-${kind}-${id}`;
const makeOwnerKey = () => `${crypto.randomUUID()}${crypto.randomUUID()}`;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext ?? "")) return <FileImage size={19} />;
  if (["zip", "rar", "7z", "tar"].includes(ext ?? "")) return <FileArchive size={19} />;
  if (["pdf", "txt", "doc", "docx", "md"].includes(ext ?? "")) return <FileText size={19} />;
  return <File size={19} />;
}

async function responseError(response: Response, fallback: string) {
  try { const body = await response.json(); return typeof body.error === "string" ? body.error : fallback; }
  catch { return fallback; }
}

export default function Home() {
  const picker = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState("");

  async function refreshLibrary(silent = false) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Could not load the public library. Refresh to try again."));
      const data = await response.json() as { files: SharedFile[]; folders: FolderItem[] };
      setFiles(data.files.map((item) => ({ ...item, ownerKey: sessionStorage.getItem(ownerStorageKey("file", item.id)) ?? undefined })));
      setFolders(data.folders.map((item) => ({ ...item, ownerKey: sessionStorage.getItem(ownerStorageKey("folder", item.id)) ?? undefined })));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not load the public library. Refresh to try again."); }
    finally { if (!silent) setLoading(false); }
  }

  useEffect(() => {
    void refreshLibrary();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refreshLibrary(true); }, 15000);
    return () => window.clearInterval(interval);
  }, []);

  async function addFiles(incoming: FileList | null) {
    if (!incoming?.length || uploading) return;
    const accepted = Array.from(incoming).filter((file) => file.size > 0 && file.size <= MAX_FILE_SIZE);
    const rejected = incoming.length - accepted.length;
    if (picker.current) picker.current.value = "";
    if (!accepted.length) { setNotice("Files must be non-empty and no larger than 2 GB."); return; }
    let added = 0;
    const errors: string[] = [];
    for (const file of accepted) {
      setUploading(file.name);
      const ownerKey = makeOwnerKey();
      try {
        const init = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream", folderId }) });
        if (!init.ok) throw new Error(await responseError(init, "Upload could not start."));
        const upload = await init.json() as { id: string; uploadUrl: string; name: string; size: number; contentType: string; folderId: string | null };
        const uploadUrl = new URL(upload.uploadUrl, window.location.origin);
        uploadUrl.protocol = window.location.protocol;
        uploadUrl.host = window.location.host;
        const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": upload.contentType }, body: file });
        if (!put.ok) throw new Error(await responseError(put, "The file could not be saved on this server."));
        const finish = await fetch("/api/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: upload.id, name: upload.name, size: upload.size, contentType: upload.contentType, folderId: upload.folderId, ownerKey }) });
        if (!finish.ok) throw new Error(await responseError(finish, "Upload finished but could not be added to the public library."));
        sessionStorage.setItem(ownerStorageKey("file", upload.id), ownerKey);
        added += 1;
      } catch (error) { errors.push(error instanceof Error ? error.message : "Upload failed."); }
    }
    setUploading("");
    await refreshLibrary();
    setNotice(errors.length ? `${added} uploaded. ${errors[0]}` : `${added} ${added === 1 ? "file is" : "files are"} now visible to all visitors.${rejected ? ` ${rejected} empty or oversized file(s) skipped.` : ""}`);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); void addFiles(event.dataTransfer.files); }

  async function createFolder() {
    const name = window.prompt("Name your new folder");
    if (!name?.trim()) return;
    const ownerKey = makeOwnerKey();
    try {
      const response = await fetch("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), parentId: folderId, ownerKey }) });
      if (!response.ok) throw new Error(await responseError(response, "Folder could not be created."));
      const folder = await response.json() as FolderItem;
      sessionStorage.setItem(ownerStorageKey("folder", folder.id), ownerKey);
      setFolders((current) => [...current, { ...folder, ownerKey }]);
      setNotice(`“${folder.name}” was added to the public workspace.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Folder could not be created. Try again."); }
  }

  function ancestorFolders(parentId: string | null) {
    const chain: FolderItem[] = [];
    let folder = folders.find((item) => item.id === parentId);
    while (folder) { chain.unshift(folder); folder = folders.find((item) => item.id === folder?.parentId); }
    return chain;
  }

  async function fileAccessUrl(item: SharedFile) {
    const passwords: Record<string, string> = {};
    const locked = [...ancestorFolders(item.folderId).filter((folder) => folder.protected).map((folder) => ({ id: folder.id, name: `folder “${folder.name}”` })), ...(item.protected ? [{ id: item.id, name: `file “${item.name}”` }] : [])];
    for (const entry of locked) {
      const password = window.prompt(`Enter the password for ${entry.name}`);
      if (password === null) return null;
      passwords[entry.id] = password;
    }
    const send = (extra: { recoveryCode?: string; newPassword?: string } = {}) => fetch(`/api/files/${item.id}/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passwords, ...extra }) });
    let response = await send();
    if (response.status === 401 && window.confirm("Password didn’t match. Use the owner recovery code to reset it?")) {
      const recoveryCode = window.prompt("Enter the recovery code saved by the uploader");
      if (!recoveryCode) return null;
      const newPassword = window.prompt("Set a new password (at least 4 characters)");
      if (!newPassword || newPassword.length < 4) { setNotice("Use a password with at least 4 characters."); return null; }
      response = await send({ recoveryCode, newPassword });
    }
    if (!response.ok) { setNotice(await responseError(response, "Password check failed. Try again.")); return null; }
    return (await response.json() as { url: string }).url;
  }

  async function openFile(item: SharedFile) {
    const preview = window.open("about:blank", "_blank");
    if (!preview) { setNotice("Allow pop-ups to preview this file in a new tab."); return; }
    const url = await fileAccessUrl(item);
    if (url) preview.location.assign(new URL(url, window.location.origin).toString()); else preview.close();
  }

  async function downloadFile(item: SharedFile) {
    const url = await fileAccessUrl(item);
    if (url) window.location.assign(`${url}&download=1`);
  }

  async function copyLink(item: SharedFile) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${item.id}`);
      setCopied(item.id); setNotice("Public share link copied."); window.setTimeout(() => setCopied(null), 2200);
    } catch { setNotice("Clipboard access is blocked. Allow clipboard access and try again."); }
  }

  async function toggleProtection(kind: "file" | "folder", item: SharedFile | FolderItem) {
    const ownerKey = item.ownerKey ?? sessionStorage.getItem(ownerStorageKey(kind, item.id));
    if (!ownerKey) { setNotice("Only the person who uploaded this file or created this folder can change its password."); return; }
    let password: string | null;
    if (item.protected) {
      if (!window.confirm(`Remove password protection from “${item.name}”?`)) return;
      password = null;
    } else {
      password = window.prompt(`Set a password for “${item.name}” (at least 4 characters)`);
      if (password === null) return;
      if (password.length < 4) { setNotice("Use a password with at least 4 characters."); return; }
    }
    try {
      const response = await fetch(`/api/${kind === "file" ? "files" : "folders"}/${item.id}/protection`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerKey, password }) });
      if (!response.ok) throw new Error(await responseError(response, "Password could not be changed."));
      const result = await response.json() as { recoveryCode: string | null };
      if (result.recoveryCode) window.alert(`Save this owner recovery code. It is required to reset the password.\n\n${result.recoveryCode}`);
      if (kind === "file") setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, protected: Boolean(password) } : entry));
      else setFolders((current) => current.map((entry) => entry.id === item.id ? { ...entry, protected: Boolean(password) } : entry));
      setNotice(password ? "Password protection enabled." : "Password protection removed.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Password could not be changed."); }
  }

  async function removeItem(kind: "file" | "folder", item: SharedFile | FolderItem) {
    if (!window.confirm(kind === "file" ? `Delete “${item.name}” from the public library?` : `Delete “${item.name}” and everything inside it?`)) return;
    const ownerKey = item.ownerKey ?? sessionStorage.getItem(ownerStorageKey(kind, item.id));
    if (!ownerKey) { setNotice("Only the uploader or folder creator can delete this item from this browser."); return; }
    try {
      const response = await fetch(`/api/${kind === "file" ? "files" : "folders"}/${item.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerKey }) });
      if (!response.ok) throw new Error(await responseError(response, "Could not delete this item."));
      sessionStorage.removeItem(ownerStorageKey(kind, item.id));
      await refreshLibrary();
      setNotice(kind === "file" ? "File removed from the public library." : "Folder and its contents removed.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not delete this item."); }
  }

  async function openFolder(item: FolderItem) {
    if (item.protected) {
      const password = window.prompt(`Enter the password for folder “${item.name}”`);
      if (password === null) return;
      try {
        const send = (extra: { recoveryCode?: string; newPassword?: string } = {}) => fetch(`/api/folders/${item.id}/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, ...extra }) });
        let response = await send();
        if (response.status === 401 && window.confirm("Password didn’t match. Use the folder owner recovery code to reset it?")) {
          const recoveryCode = window.prompt("Enter the recovery code saved by the folder owner");
          if (!recoveryCode) return;
          const newPassword = window.prompt("Set a new password (at least 4 characters)");
          if (!newPassword || newPassword.length < 4) { setNotice("Use a password with at least 4 characters."); return; }
          response = await send({ recoveryCode, newPassword });
        }
        if (!response.ok) { setNotice(await responseError(response, "Folder password is incorrect.")); return; }
      } catch { setNotice("Could not verify the folder password. Try again."); return; }
    }
    setFolderId(item.id);
  }

  const visibleFiles = files.filter(({ name, folderId: parent }) => parent === folderId && name.toLowerCase().includes(query.toLowerCase()));
  const visibleFolders = folders.filter((item) => item.parentId === folderId && item.name.toLowerCase().includes(query.toLowerCase()));
  const currentFolder = folders.find((item) => item.id === folderId);
  const breadcrumbs: FolderItem[] = ancestorFolders(folderId);

  return (
    <main className="workspace">
      <aside className="sidebar">
        <a className="brand" href="#home" aria-label="Folio home"><span className="brand-mark"><Link2 size={20} strokeWidth={2.4} /></span><span>folio<span className="brand-dot">.</span></span></a>
        <div className="side-label">PUBLIC WORKSPACE</div>
        <button className={`nav-item ${folderId === null ? "active" : ""}`} onClick={() => setFolderId(null)}><span className="nav-symbol"><File size={17} /></span>All files<span className="nav-count">{files.length}</span></button>
        <button className="nav-item" onClick={() => setNotice("Every visitor can browse and download files in this workspace.")}><span className="nav-symbol"><Clock3 size={17} /></span>For everyone</button>
        <div className="side-bottom"><div className="plan-card"><div className="plan-icon"><ShieldCheck size={17} /></div><p>One shared workspace.</p><span>Uploads appear for everyone who visits this website.</span></div><div className="profile"><div className="avatar">F</div><div className="profile-copy"><strong>Public workspace</strong><span>Shared library</span></div><ChevronDown size={16} className="profile-chevron" /></div></div>
      </aside>
      <section className="main-panel" id="home">
        <header className="topbar"><div className="breadcrumb">Public workspace <span>/</span> <button onClick={() => setFolderId(null)}>All files</button>{breadcrumbs.map((item, index) => <span key={item.id}><span>/</span>{index === breadcrumbs.length - 1 ? <strong>{item.name}</strong> : <button onClick={() => void openFolder(item)}>{item.name}</button>}</span>)}</div><div className="top-actions"><span className="secure-note"><ShieldCheck size={15}/> Visible to every visitor</span><button className="upload-top" onClick={() => void createFolder()}><FolderPlus size={16}/> New folder</button><button className="upload-top" disabled={Boolean(uploading)} onClick={() => picker.current?.click()}><Plus size={17}/> Upload files</button></div></header>
        <div className="content">
          <div className="page-heading"><div><div className="eyebrow">OPEN LIBRARY <span className="live-dot"/> PUBLIC FILES</div><h1>{currentFolder?.name ?? "All files"}</h1><p className="subtitle">Anyone can upload. Everyone who visits can browse and download.</p></div><div className="heading-decoration" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><span><Link2 size={24}/></span></div></div>
          <div className={`dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={onDrop}>
            <input ref={picker} className="file-input" type="file" multiple aria-label="Choose files to upload" onChange={(event: ChangeEvent<HTMLInputElement>) => void addFiles(event.target.files)} />
            <div className="upload-icon"><ArrowUpFromLine size={22}/></div><div className="drop-copy"><strong>{uploading ? `Uploading ${uploading}…` : dragging ? "Drop to add files" : "Drop files for everyone"}</strong><span>{uploading ? "Saving to the shared workspace…" : "Files you add here are shared with every visitor."}</span></div><button className="browse-button" disabled={Boolean(uploading)} onClick={() => picker.current?.click()}>{uploading ? <span className="spinner"/> : null}{uploading ? "Uploading…" : "Browse files"}</button><span className="drop-hint">Any file type <i/> Up to 2 GB per file</span>
          </div>
          <div className="file-toolbar"><div className="list-title"><h2>{currentFolder ? "Folder contents" : "Shared files"}</h2><span className="file-total">{visibleFolders.length + visibleFiles.length}</span></div>{files.length + folders.length > 0 && <label className="search-field"><Search size={16}/><input aria-label="Search files and folders" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shared files"/></label>}<button className="refresh-button" onClick={() => void refreshLibrary()} disabled={loading} aria-label="Refresh public workspace"><Clock3 size={15}/><span>{loading ? "Refreshing…" : "Refresh"}</span></button></div>
          {loading ? <div className="loading-state" role="status"><span className="spinner spinner-blue"/> Loading the public workspace…</div> : visibleFolders.length + visibleFiles.length === 0 ? <div className="empty-state"><div className="empty-graphic"><div className="empty-sheet sheet-back"/><div className="empty-sheet sheet-front"><File size={24}/></div><span className="empty-plus"><Plus size={13}/></span></div><h3>{query ? "No matches found" : "The workspace is ready"}</h3><p>{query ? "Try a different search." : "Add a file or create a folder for everyone to see."}</p><button className="empty-action" onClick={query ? () => setQuery("") : () => picker.current?.click()}>{query ? <X size={16}/> : <ArrowUpFromLine size={16}/>} {query ? "Clear search" : "Upload a file"}</button></div> : <div className="file-list"><div className="list-header"><span>NAME</span><span>SIZE</span><span>ADDED</span><span>ACTIONS</span></div>{visibleFolders.map((item) => <div className="file-row folder-row" key={item.id}><button className="file-name folder-open" onClick={() => void openFolder(item)}><span className="file-type folder-type"><Folder size={19}/></span><span className="file-meta"><strong>{item.protected && <LockKeyhole size={12} className="inline-lock"/>}{item.name}</strong><small>Folder · {files.filter((file) => file.folderId === item.id).length} files</small></span></button><span className="file-size">—</span><span className="file-date">{new Date(item.createdAt).toLocaleDateString()}</span><span className="row-actions"><button className="download-button" onClick={() => void toggleProtection("folder", item)} aria-label={`${item.protected ? "Remove" : "Add"} folder password`} title={item.protected ? "Remove password" : "Add password"}>{item.protected ? <LockKeyhole size={15}/> : <UnlockKeyhole size={15}/>}</button>{item.ownerKey && <button className="download-button" onClick={() => void removeItem("folder", item)} aria-label={`Delete folder ${item.name}`}><Trash2 size={16}/></button>}</span></div>)}{visibleFiles.map((item) => <div className="file-row" key={item.id}><span className="file-name"><span className="file-type"><FileIcon name={item.name}/></span><span className="file-meta"><strong>{item.protected && <LockKeyhole size={12} className="inline-lock"/>}{item.name}</strong><small>{formatSize(item.size)} · {item.protected ? "Password required" : "Public"}</small></span></span><span className="file-size">{formatSize(item.size)}</span><span className="file-date">{new Date(item.createdAt).toLocaleDateString()}</span><span className="row-actions"><button className={`copy-button ${copied === item.id ? "copied" : ""}`} onClick={() => void copyLink(item)} aria-label={`Copy share link for ${item.name}`}>{copied === item.id ? <Check size={15}/> : <Copy size={15}/>}<span>{copied === item.id ? "Copied" : "Copy link"}</span></button><button className="download-button" onClick={() => void openFile(item)} aria-label={`Open ${item.name} in browser`}><Eye size={16}/></button><button className="download-button" onClick={() => void downloadFile(item)} aria-label={`Download ${item.name}`}><ArrowDownToLine size={17}/></button><button className="download-button" onClick={() => void toggleProtection("file", item)} aria-label={`${item.protected ? "Remove" : "Add"} password for ${item.name}`} title={item.protected ? "Remove password" : "Add password"}>{item.protected ? <LockKeyhole size={15}/> : <UnlockKeyhole size={15}/>}</button>{item.ownerKey && <button className="download-button" onClick={() => void removeItem("file", item)} aria-label={`Delete ${item.name}`}><Trash2 size={16}/></button>}</span></div>)}</div>}
          {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={14}/></button></div>}
          <footer className="footnote"><span><ShieldCheck size={14}/> Public uploads are visible to every visitor.</span><button onClick={() => setNotice("Only password-protected files require a password to open or download.")} aria-label="Public library information"><MoreHorizontal size={16}/></button></footer>
        </div>
      </section>
    </main>
  );
}
