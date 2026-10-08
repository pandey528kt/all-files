"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, Clock3, Copy, Eye, File, FileArchive, FileImage, FileText, Folder, FolderPlus, Link2, LockKeyhole, MoreHorizontal, Plus, Search, ShieldCheck, Trash2, UnlockKeyhole, X } from "lucide-react";

type SharedFile = { id: string; file: File; url: string; added: string; folderId: string | null; password: string | null };
type FolderItem = { id: string; name: string; parentId: string | null; created: number; password: string | null };
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext ?? "")) return <FileImage size={19} />;
  if (["zip", "rar", "7z", "tar"].includes(ext ?? "")) return <FileArchive size={19} />;
  if (["pdf", "txt", "doc", "docx", "md"].includes(ext ?? "")) return <FileText size={19} />;
  return <File size={19} />;
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
  const [busy, setBusy] = useState(false);

  function addFiles(incoming: FileList | null) {
    if (!incoming?.length) return;
    setBusy(true);
    const selected = Array.from(incoming);
    const accepted = selected.filter((file) => file.size > 0 && file.size <= MAX_FILE_SIZE);
    const oversized = selected.filter((file) => file.size > MAX_FILE_SIZE);
    const empty = selected.filter((file) => file.size === 0);
    if (!accepted.length) {
      setNotice(oversized.length ? `Files must be 2 GB or smaller. ${oversized.map((file) => file.name).join(", ")} was not added.` : "Those files are empty. Choose a different file to share.");
      setBusy(false);
      return;
    }
    setFiles((current) => [...accepted.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), added: "Just now", folderId, password: null })), ...current]);
    const details = [oversized.length ? `${oversized.length} exceeded the 2 GB limit` : "", empty.length ? `${empty.length} empty ${empty.length === 1 ? "file was" : "files were"} skipped` : ""].filter(Boolean).join("; ");
    setNotice(`${accepted.length} ${accepted.length === 1 ? "file added" : "files added"}${folderId ? ` to ${folders.find((item) => item.id === folderId)?.name ?? "folder"}` : ""}.${details ? ` ${details}.` : ""}`);
    setBusy(false);
    if (picker.current) picker.current.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  async function copyLink(item: SharedFile) {
    if (!verifyFileAccess(item)) return;
    const shareUrl = `${window.location.origin}/share/${item.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(item.id);
      setNotice("Share link copied to clipboard.");
      setTimeout(() => setCopied(null), 2200);
    } catch {
      setNotice("Clipboard access is blocked. Open your browser settings and try again.");
    }
  }

  function verifyPassword(label: string, password: string | null) {
    if (!password) return true;
    const entered = window.prompt(`Enter the password for ${label}`);
    if (entered === password) return true;
    if (entered !== null) setNotice("That password didn’t match. Try again.");
    return false;
  }

  function verifyFileAccess(item: SharedFile) {
    const chain: FolderItem[] = [];
    let parent = folders.find((folder) => folder.id === item.folderId);
    while (parent) {
      chain.unshift(parent);
      parent = folders.find((folder) => folder.id === parent?.parentId);
    }
    for (const folder of chain) if (!verifyPassword(`folder “${folder.name}”`, folder.password)) return false;
    return verifyPassword(`file “${item.file.name}”`, item.password);
  }

  function openFolder(item: FolderItem) {
    const chain: FolderItem[] = [];
    let parent: FolderItem | undefined = item;
    while (parent) {
      chain.unshift(parent);
      parent = folders.find((folder) => folder.id === parent?.parentId);
    }
    for (const folder of chain) if (!verifyPassword(`folder “${folder.name}”`, folder.password)) return;
    setFolderId(item.id);
  }

  function toggleFilePassword(item: SharedFile) {
    if (item.password) {
      if (!window.confirm(`Remove the password requirement from “${item.file.name}”?`)) return;
      setFiles((current) => current.map((file) => file.id === item.id ? { ...file, password: null } : file));
      setNotice("File password removed.");
      return;
    }
    const password = window.prompt(`Create a password for “${item.file.name}” (at least 4 characters)`);
    if (password === null) return;
    if (password.length < 4) { setNotice("Use a password with at least 4 characters."); return; }
    setFiles((current) => current.map((file) => file.id === item.id ? { ...file, password } : file));
    setNotice("File password enabled. Downloads and link copying now require it.");
  }

  function toggleFolderPassword(item: FolderItem) {
    if (item.password) {
      if (!window.confirm(`Remove the password requirement from folder “${item.name}”?`)) return;
      setFolders((current) => current.map((folder) => folder.id === item.id ? { ...folder, password: null } : folder));
      setNotice("Folder password removed.");
      return;
    }
    const password = window.prompt(`Create a password for folder “${item.name}” (at least 4 characters)`);
    if (password === null) return;
    if (password.length < 4) { setNotice("Use a password with at least 4 characters."); return; }
    setFolders((current) => current.map((folder) => folder.id === item.id ? { ...folder, password } : folder));
    setNotice("Folder password enabled. Opening it and accessing its files now requires it.");
  }

  function downloadFile(item: SharedFile) {
    if (!verifyFileAccess(item)) return;
    const anchor = document.createElement("a");
    anchor.href = item.url;
    anchor.download = item.file.name;
    anchor.click();
  }

  function openFile(item: SharedFile) {
    if (!verifyFileAccess(item)) return;
    const opened = window.open(item.url, "_blank", "noopener,noreferrer");
    if (!opened) setNotice("Your browser blocked the preview. Allow pop-ups for this site and try again.");
  }

  const visibleFiles = files.filter(({ file, folderId: parent }) => parent === folderId && file.name.toLowerCase().includes(query.toLowerCase()));
  const visibleFolders = folders.filter((item) => item.parentId === folderId && item.name.toLowerCase().includes(query.toLowerCase()));
  const currentFolder = folders.find((item) => item.id === folderId);
  const breadcrumbs: FolderItem[] = [];
  let breadcrumbFolder = currentFolder;
  while (breadcrumbFolder) {
    breadcrumbs.unshift(breadcrumbFolder);
    breadcrumbFolder = folders.find((item) => item.id === breadcrumbFolder?.parentId);
  }

  function createFolder() {
    const name = window.prompt("Name your new folder");
    if (!name?.trim()) return;
    if (folders.some((item) => item.parentId === folderId && item.name.toLowerCase() === name.trim().toLowerCase())) {
      setNotice("A folder with that name already exists here.");
      return;
    }
    setFolders((current) => [...current, { id: crypto.randomUUID(), name: name.trim(), parentId: folderId, created: Date.now(), password: null }]);
    setNotice(`Folder “${name.trim()}” created.`);
  }

  function deleteFile(item: SharedFile) {
    if (!window.confirm(`Delete “${item.file.name}” from this workspace?`)) return;
    URL.revokeObjectURL(item.url);
    setFiles((current) => current.filter((file) => file.id !== item.id));
    setNotice("File deleted.");
  }

  function deleteFolder(item: FolderItem) {
    if (!window.confirm(`Delete the “${item.name}” folder and everything inside it?`)) return;
    const removeIds = new Set([item.id]);
    let changed = true;
    while (changed) {
      changed = false;
      folders.forEach((folder) => { if (folder.parentId && removeIds.has(folder.parentId) && !removeIds.has(folder.id)) { removeIds.add(folder.id); changed = true; } });
    }
    files.filter((file) => file.folderId && removeIds.has(file.folderId)).forEach((file) => URL.revokeObjectURL(file.url));
    setFiles((current) => current.filter((file) => !file.folderId || !removeIds.has(file.folderId)));
    setFolders((current) => current.filter((folder) => !removeIds.has(folder.id)));
    setNotice("Folder and its contents deleted.");
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <a className="brand" href="#home" aria-label="Folio home"><span className="brand-mark"><Link2 size={20} strokeWidth={2.4} /></span><span>folio<span className="brand-dot">.</span></span></a>
        <div className="side-label">WORKSPACE</div>
        <button className={`nav-item ${folderId === null ? "active" : ""}`} onClick={() => setFolderId(null)}><span className="nav-symbol"><File size={17} /></span>All files<span className="nav-count">{files.length}</span></button>
        <button className="nav-item" onClick={() => setNotice("Your recent files appear here.")}><span className="nav-symbol"><Clock3 size={17} /></span>Recent</button>
        <div className="side-bottom"><div className="plan-card"><div className="plan-icon"><ShieldCheck size={17} /></div><p>Just you and your files.</p><span>Links are ready to share when you are.</span></div><div className="profile"><div className="avatar">Y</div><div className="profile-copy"><strong>Your workspace</strong><span>Personal space</span></div><ChevronDown size={16} className="profile-chevron" /></div></div>
      </aside>

      <section className="main-panel" id="home">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <button onClick={() => setFolderId(null)}>All files</button>{breadcrumbs.map((item, index) => <span key={item.id}><span>/</span>{index === breadcrumbs.length - 1 ? <strong>{item.name}</strong> : <button onClick={() => setFolderId(item.id)}>{item.name}</button>}</span>)}</div><div className="top-actions"><span className="secure-note"><ShieldCheck size={15} /> Private by default</span><button className="upload-top" onClick={createFolder}><FolderPlus size={16} /> New folder</button><button className="upload-top" onClick={() => picker.current?.click()}><Plus size={17} /> Upload files</button></div></header>
        <div className="content">
          <div className="page-heading"><div><div className="eyebrow">YOUR SPACE</div><h1>{currentFolder?.name ?? "All files"}</h1><p className="subtitle">Organize, keep, and share the things that matter.</p></div><div className="heading-decoration" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><span><Link2 size={24}/></span></div></div>

          <div className={`dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={onDrop}>
            <input ref={picker} className="file-input" type="file" multiple aria-label="Choose files to upload" onChange={(e: ChangeEvent<HTMLInputElement>) => addFiles(e.target.files)} />
            <div className="upload-icon"><ArrowUpFromLine size={22} /></div>
            <div className="drop-copy"><strong>{busy ? "Getting your files ready…" : dragging ? "Drop to add your files" : "Drop files here to share"}</strong><span>or choose files from your device</span></div>
            <button className="browse-button" disabled={busy} onClick={() => picker.current?.click()}>{busy ? <span className="spinner"/> : null}{busy ? "Preparing…" : "Browse files"}</button>
            <span className="drop-hint">Any file type <i /> Up to 2 GB per file</span>
          </div>

          <div className="file-toolbar"><div className="list-title"><h2>{currentFolder ? "Folder contents" : "Your files"}</h2><span className="file-total">{visibleFolders.length + visibleFiles.length}</span></div>{files.length + folders.length > 0 && <label className="search-field"><Search size={16}/><input aria-label="Search files and folders" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files and folders" /></label>}</div>

          {visibleFolders.length + visibleFiles.length === 0 ? <div className="empty-state"><div className="empty-graphic"><div className="empty-sheet sheet-back"/><div className="empty-sheet sheet-front"><File size={24}/></div><span className="empty-plus"><Plus size={13}/></span></div><h3>{query ? "No matches found" : "Nothing here just yet"}</h3><p>{query ? "Try a different search, or clear your query." : "Create a folder or add a file to get started."}</p><button className="empty-action" onClick={query ? () => setQuery("") : createFolder}>{query ? <X size={16}/> : <FolderPlus size={16}/>} {query ? "Clear search" : "Create a folder"}</button></div> : <div className="file-list"><div className="list-header"><span>NAME</span><span>SIZE</span><span>ADDED</span><span>ACTIONS</span></div>{visibleFolders.map((item) => <div className="file-row folder-row" key={item.id}><button className="file-name folder-open" onClick={() => openFolder(item)}><span className="file-type folder-type"><Folder size={19}/></span><span className="file-meta"><strong>{item.password && <LockKeyhole size={12} className="inline-lock"/>}{item.name}</strong><small>Folder · {files.filter((file) => file.folderId === item.id).length} files</small></span></button><span className="file-size">—</span><span className="file-date">Folder</span><span className="row-actions"><button className={`download-button ${item.password ? "remove-password" : ""}`} onClick={() => toggleFolderPassword(item)} aria-label={`${item.password ? "Remove" : "Add"} password for folder ${item.name}`} title={`${item.password ? "Remove" : "Add"} password`}>{item.password ? <><LockKeyhole size={15}/><span>Remove password</span></> : <UnlockKeyhole size={15}/>}</button><button className="download-button" onClick={() => deleteFolder(item)} aria-label={`Delete folder ${item.name}`}><Trash2 size={16}/></button></span></div>)}{visibleFiles.map((item) => <div className="file-row" key={item.id}><span className="file-name"><span className="file-type"><FileIcon name={item.file.name}/></span><span className="file-meta"><strong>{item.password && <LockKeyhole size={12} className="inline-lock"/>}{item.file.name}</strong><small>{item.password ? "Password required" : "Ready to share"}</small></span></span><span className="file-size">{formatSize(item.file.size)}</span><span className="file-date">{item.added}</span><span className="row-actions"><button className={`copy-button ${copied === item.id ? "copied" : ""}`} onClick={() => copyLink(item)} aria-label={`Copy share link for ${item.file.name}`}>{copied === item.id ? <Check size={15}/> : <Copy size={15}/>}<span>{copied === item.id ? "Copied" : "Copy link"}</span></button><button className="download-button" onClick={() => openFile(item)} aria-label={`Open ${item.file.name} in browser`}><Eye size={16}/></button><button className="download-button" onClick={() => downloadFile(item)} aria-label={`Download ${item.file.name}`}><ArrowDownToLine size={17}/></button><button className={`download-button ${item.password ? "remove-password" : ""}`} onClick={() => toggleFilePassword(item)} aria-label={`${item.password ? "Remove" : "Add"} password for ${item.file.name}`} title={`${item.password ? "Remove" : "Add"} password`}>{item.password ? <><LockKeyhole size={15}/><span>Remove password</span></> : <UnlockKeyhole size={15}/>}</button><button className="download-button" onClick={() => deleteFile(item)} aria-label={`Delete ${item.file.name}`}><Trash2 size={16}/></button></span></div>)}</div>}
          {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={14}/></button></div>}
          <footer className="footnote"><span><ShieldCheck size={14}/> Files are available in this browser session.</span><button onClick={() => setNotice("Files up to 2 GB can be added. Cloud sharing requires connecting a storage service.")}><MoreHorizontal size={16} aria-label="More information"/></button></footer>
        </div>
      </section>
    </main>
  );
}
