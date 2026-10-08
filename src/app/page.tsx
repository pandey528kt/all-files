"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, Clock3, Copy, Eye, File, FileArchive, FileImage, FileText, Folder, FolderPlus, Link2, MoreHorizontal, Plus, Search, ShieldCheck, X } from "lucide-react";

type SharedFile = { id: string; name: string; size: number; contentType: string; folderId: string | null; createdAt: string; protected: boolean };
type FolderItem = { id: string; name: string; parentId: string | null; createdAt: string; protected: boolean };
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

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
  try {
    const body = await response.json();
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
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
  const [storageReady, setStorageReady] = useState<boolean | null>(null);

  async function refreshLibrary() {
    setLoading(true);
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "The shared library could not be loaded."));
      const data = await response.json() as { files: SharedFile[]; folders: FolderItem[]; storageReady: boolean };
      setFiles(data.files);
      setFolders(data.folders);
      setStorageReady(data.storageReady);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The shared library could not be loaded. Refresh to try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refreshLibrary(); }, []);

  async function addFiles(incoming: FileList | null) {
    if (!incoming?.length || uploading) return;
    if (storageReady === false) {
      setNotice("Shared uploads need the site owner to configure Cloudflare R2 storage first.");
      return;
    }
    const selected = Array.from(incoming);
    const accepted = selected.filter((file) => file.size > 0 && file.size <= MAX_FILE_SIZE);
    const rejected = selected.length - accepted.length;
    if (picker.current) picker.current.value = "";
    if (!accepted.length) {
      setNotice("Files must be non-empty and no larger than 2 GB. Choose another file to upload.");
      return;
    }
    let added = 0;
    const failures: string[] = [];
    for (const file of accepted) {
      setUploading(file.name);
      try {
        const initResponse = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream", folderId }),
        });
        if (!initResponse.ok) throw new Error(await responseError(initResponse, "Upload could not start."));
        const upload = await initResponse.json() as { id: string; uploadUrl: string; name: string; size: number; contentType: string; folderId: string | null };
        const objectResponse = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": upload.contentType }, body: file });
        if (!objectResponse.ok) throw new Error("Storage rejected the upload. Check the bucket CORS settings and try again.");
        const saveResponse = await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: upload.id, name: upload.name, size: upload.size, contentType: upload.contentType, folderId: upload.folderId }),
        });
        if (!saveResponse.ok) throw new Error(await responseError(saveResponse, "Upload finished but could not be added to the library."));
        added += 1;
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : "Upload failed."}`);
      }
    }
    setUploading("");
    await refreshLibrary();
    if (failures.length) setNotice(added ? `${added} uploaded. ${rejected} skipped. ${failures[0]}` : failures[0]);
    else setNotice(`${added} ${added === 1 ? "file uploaded" : "files uploaded"} to the shared library.${rejected ? ` ${rejected} file(s) skipped: empty or over 2 GB.` : ""}`);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void addFiles(event.dataTransfer.files);
  }

  async function createFolder() {
    const name = window.prompt("Name your new folder");
    if (!name?.trim()) return;
    try {
      const response = await fetch("/api/folders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), parentId: folderId }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Folder could not be created."));
      const item = await response.json() as FolderItem;
      setFolders((current) => [...current, item]);
      setNotice(`Folder “${item.name}” created in the shared library.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Folder could not be created. Try again.");
    }
  }

  async function copyLink(item: SharedFile) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/api/files/${item.id}/download`);
      setCopied(item.id);
      setNotice("Public download link copied.");
      window.setTimeout(() => setCopied(null), 2200);
    } catch {
      setNotice("Clipboard access is blocked. Allow clipboard access and try again.");
    }
  }

  const visibleFiles = files.filter(({ name, folderId: parent }) => parent === folderId && name.toLowerCase().includes(query.toLowerCase()));
  const visibleFolders = folders.filter((item) => item.parentId === folderId && item.name.toLowerCase().includes(query.toLowerCase()));
  const currentFolder = folders.find((item) => item.id === folderId);
  const breadcrumbs: FolderItem[] = [];
  let breadcrumbFolder = currentFolder;
  while (breadcrumbFolder) {
    breadcrumbs.unshift(breadcrumbFolder);
    breadcrumbFolder = folders.find((item) => item.id === breadcrumbFolder?.parentId);
  }

  return (
    <div className="site-shell">
      <main className="workspace">
        <aside className="sidebar">
          <a className="brand" href="#home" aria-label="Folio home"><span className="brand-mark"><Link2 size={20} strokeWidth={2.4} /></span><span>folio<span className="brand-dot">.</span></span></a>
          <div className="side-label">PUBLIC LIBRARY</div>
          <button className={`nav-item ${folderId === null ? "active" : ""}`} onClick={() => setFolderId(null)}><span className="nav-symbol"><File size={17} /></span>All files<span className="nav-count">{files.length}</span></button>
          <button className="nav-item" onClick={() => setNotice("The shared library is open to every visitor.")}><span className="nav-symbol"><Clock3 size={17} /></span>For everyone</button>
          <div className="side-bottom"><div className="plan-card"><div className="plan-icon"><ShieldCheck size={17} /></div><p>One shared space.</p><span>Files uploaded here appear for everyone who visits.</span></div><div className="profile"><div className="avatar">F</div><div className="profile-copy"><strong>Folio library</strong><span>Public workspace</span></div><ChevronDown size={16} className="profile-chevron" /></div></div>
        </aside>

        <section className="main-panel" id="home">
          <header className="topbar"><div className="breadcrumb">Public library <span>/</span> <button onClick={() => setFolderId(null)}>All files</button>{breadcrumbs.map((item, index) => <span key={item.id}><span>/</span>{index === breadcrumbs.length - 1 ? <strong>{item.name}</strong> : <button onClick={() => setFolderId(item.id)}>{item.name}</button>}</span>)}</div><div className="top-actions"><span className="secure-note"><ShieldCheck size={15} /> Shared with everyone</span><button className="upload-top" onClick={() => void createFolder()}><FolderPlus size={16} /> New folder</button><button className="upload-top" onClick={() => picker.current?.click()} disabled={Boolean(uploading)}><Plus size={17} /> Upload files</button></div></header>
          <div className="content">
            <div className="page-heading"><div><div className="eyebrow">OPEN LIBRARY <span className="live-dot"/> PUBLIC FILES</div><h1>{currentFolder?.name ?? "All files"}</h1><p className="subtitle">A shared place for files from everyone, available to every visitor.</p></div><div className="heading-decoration" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><span><Link2 size={24}/></span></div></div>
            <div className={`dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={onDrop}>
              <input ref={picker} className="file-input" type="file" multiple aria-label="Choose files to upload" onChange={(event: ChangeEvent<HTMLInputElement>) => void addFiles(event.target.files)} />
              <div className="upload-icon"><ArrowUpFromLine size={22} /></div>
              <div className="drop-copy"><strong>{uploading ? `Uploading ${uploading}…` : dragging ? "Drop to add your files" : storageReady === false ? "Shared storage needs to be connected" : "Drop files to share with everyone"}</strong><span>{uploading ? "Your file is being sent to shared storage." : storageReady === false ? "The site owner must configure R2 storage before uploads can work." : "Anyone can upload. Files become visible to all visitors."}</span></div>
              <button className="browse-button" disabled={Boolean(uploading) || storageReady === false} onClick={() => picker.current?.click()}>{uploading ? <span className="spinner"/> : null}{uploading ? "Uploading…" : storageReady === false ? "Storage unavailable" : "Browse files"}</button>
              <span className="drop-hint">Any file type <i /> Up to 2 GB per file</span>
            </div>
            <div className="file-toolbar"><div className="list-title"><h2>{currentFolder ? "Folder contents" : "Shared files"}</h2><span className="file-total">{visibleFolders.length + visibleFiles.length}</span></div>{files.length + folders.length > 0 && <label className="search-field"><Search size={16}/><input aria-label="Search files and folders" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shared files" /></label>}<button className="refresh-button" onClick={() => void refreshLibrary()} disabled={loading} aria-label="Refresh shared library"><Clock3 size={15}/><span>{loading ? "Refreshing…" : "Refresh"}</span></button></div>
            {loading ? <div className="loading-state" role="status"><span className="spinner spinner-blue"/> Loading the public library…</div> : visibleFolders.length + visibleFiles.length === 0 ? <div className="empty-state"><div className="empty-graphic"><div className="empty-sheet sheet-back"/><div className="empty-sheet sheet-front"><File size={24}/></div><span className="empty-plus"><Plus size={13}/></span></div><h3>{query ? "No matches found" : storageReady === false ? "Shared storage is not connected" : "The library is ready"}</h3><p>{query ? "Try a different search, or clear your query." : storageReady === false ? "The site owner must finish the R2 setup before anyone can upload shared files." : "Upload a file or create a folder. Everyone who visits can see it."}</p><button className="empty-action" disabled={storageReady === false} onClick={query ? () => setQuery("") : () => picker.current?.click()}>{query ? <X size={16}/> : <ArrowUpFromLine size={16}/>} {query ? "Clear search" : storageReady === false ? "Uploads unavailable" : "Upload the first file"}</button></div> : <div className="file-list"><div className="list-header"><span>NAME</span><span>SIZE</span><span>ADDED</span><span>ACTIONS</span></div>{visibleFolders.map((item) => <div className="file-row folder-row" key={item.id}><button className="file-name folder-open" onClick={() => setFolderId(item.id)}><span className="file-type folder-type"><Folder size={19}/></span><span className="file-meta"><strong>{item.name}</strong><small>Folder · {files.filter((file) => file.folderId === item.id).length} files</small></span></button><span className="file-size">—</span><span className="file-date">Folder</span><span className="row-actions"><span className="folder-hint">Open folder <span aria-hidden="true">→</span></span></span></div>)}{visibleFiles.map((item) => <div className="file-row" key={item.id}><span className="file-name"><span className="file-type"><FileIcon name={item.name}/></span><span className="file-meta"><strong>{item.name}</strong><small>{item.contentType} · Public</small></span></span><span className="file-size">{formatSize(item.size)}</span><span className="file-date">{new Date(item.createdAt).toLocaleDateString()}</span><span className="row-actions"><button className={`copy-button ${copied === item.id ? "copied" : ""}`} onClick={() => void copyLink(item)} aria-label={`Copy public link for ${item.name}`}>{copied === item.id ? <Check size={15}/> : <Copy size={15}/>}<span>{copied === item.id ? "Copied" : "Copy link"}</span></button><a className="download-button" href={`/api/files/${item.id}/download`} target="_blank" rel="noreferrer" aria-label={`Open ${item.name} in browser`}><Eye size={16}/></a><a className="download-button" href={`/api/files/${item.id}/download?download=1`} aria-label={`Download ${item.name}`}><ArrowDownToLine size={17}/></a></span></div>)}</div>}
            {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={14}/></button></div>}
            <footer className="footnote"><span><ShieldCheck size={14}/> Uploads are public and available to all visitors.</span><button onClick={() => setNotice("Never upload sensitive or private information to this public library.")} aria-label="Public sharing information"><MoreHorizontal size={16}/></button></footer>
          </div>
        </section>
      </main>
      <footer className="maker-ticker" aria-label="Made by Kartikey"><div className="ticker-lane" aria-hidden="true"><div className="ticker-track">{Array.from({ length: 14 }, (_, index) => <span key={index}>MADE BY KARTIKEY <i>+</i></span>)}</div></div></footer>
    </div>
  );
}
