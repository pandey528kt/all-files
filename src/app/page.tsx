"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, Clock3, Copy, File, FileArchive, FileImage, FileText, Link2, MoreHorizontal, Plus, Search, ShieldCheck, X } from "lucide-react";

type SharedFile = { id: string; file: File; url: string; added: string };

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
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function addFiles(incoming: FileList | null) {
    if (!incoming?.length) return;
    setBusy(true);
    const accepted = Array.from(incoming).filter((file) => file.size > 0);
    if (!accepted.length) {
      setNotice("Those files are empty. Choose a different file to share.");
      setBusy(false);
      return;
    }
    setTimeout(() => {
      setFiles((current) => [...accepted.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), added: "Just now" })), ...current]);
      setNotice(`${accepted.length} ${accepted.length === 1 ? "file is" : "files are"} ready to share.`);
      setBusy(false);
      if (picker.current) picker.current.value = "";
    }, 350);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  async function copyLink(item: SharedFile) {
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

  const visibleFiles = files.filter(({ file }) => file.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <main className="workspace">
      <aside className="sidebar">
        <a className="brand" href="#home" aria-label="Folio home"><span className="brand-mark"><Link2 size={20} strokeWidth={2.4} /></span><span>folio<span className="brand-dot">.</span></span></a>
        <div className="side-label">WORKSPACE</div>
        <button className="nav-item active"><span className="nav-symbol"><File size={17} /></span>All files<span className="nav-count">{files.length}</span></button>
        <button className="nav-item" onClick={() => setNotice("Your recent files appear here.")}><span className="nav-symbol"><Clock3 size={17} /></span>Recent</button>
        <div className="side-bottom"><div className="plan-card"><div className="plan-icon"><ShieldCheck size={17} /></div><p>Just you and your files.</p><span>Links are ready to share when you are.</span></div><div className="profile"><div className="avatar">Y</div><div className="profile-copy"><strong>Your workspace</strong><span>Personal space</span></div><ChevronDown size={16} className="profile-chevron" /></div></div>
      </aside>

      <section className="main-panel" id="home">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>All files</strong></div><div className="top-actions"><span className="secure-note"><ShieldCheck size={15} /> Private by default</span><button className="upload-top" onClick={() => picker.current?.click()}><Plus size={17} /> Upload files</button></div></header>
        <div className="content">
          <div className="page-heading"><div><div className="eyebrow">YOUR SPACE</div><h1>All files</h1><p className="subtitle">A simple place to keep the things you want to share.</p></div><div className="heading-decoration" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><span><Link2 size={24}/></span></div></div>

          <div className={`dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={onDrop}>
            <input ref={picker} className="file-input" type="file" multiple aria-label="Choose files to upload" onChange={(e: ChangeEvent<HTMLInputElement>) => addFiles(e.target.files)} />
            <div className="upload-icon"><ArrowUpFromLine size={22} /></div>
            <div className="drop-copy"><strong>{busy ? "Getting your files ready…" : dragging ? "Drop to add your files" : "Drop files here to share"}</strong><span>or choose files from your device</span></div>
            <button className="browse-button" disabled={busy} onClick={() => picker.current?.click()}>{busy ? <span className="spinner"/> : null}{busy ? "Preparing…" : "Browse files"}</button>
            <span className="drop-hint">Any file type <i /> Stored on this device</span>
          </div>

          <div className="file-toolbar"><div className="list-title"><h2>Your files</h2><span className="file-total">{files.length}</span></div>{files.length > 0 && <label className="search-field"><Search size={16}/><input aria-label="Search files" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files" /></label>}</div>

          {files.length === 0 ? <div className="empty-state"><div className="empty-graphic"><div className="empty-sheet sheet-back"/><div className="empty-sheet sheet-front"><File size={24}/></div><span className="empty-plus"><Plus size={13}/></span></div><h3>Nothing here just yet</h3><p>Add a file and it will be ready to share in a moment.</p><button className="empty-action" onClick={() => picker.current?.click()}><ArrowUpFromLine size={16}/> Choose your first file</button></div> : visibleFiles.length === 0 ? <div className="no-results">No files match “{query}”. Try another name.</div> : <div className="file-list"><div className="list-header"><span>NAME</span><span>SIZE</span><span>ADDED</span><span>LINK</span></div>{visibleFiles.map((item) => <div className="file-row" key={item.id}><span className="file-name"><span className="file-type"><FileIcon name={item.file.name}/></span><span className="file-meta"><strong>{item.file.name}</strong><small>Ready to share</small></span></span><span className="file-size">{formatSize(item.file.size)}</span><span className="file-date">{item.added}</span><span className="row-actions"><button className={`copy-button ${copied === item.id ? "copied" : ""}`} onClick={() => copyLink(item)} aria-label={`Copy share link for ${item.file.name}`}>{copied === item.id ? <Check size={15}/> : <Copy size={15}/>}<span>{copied === item.id ? "Copied" : "Copy link"}</span></button><a className="download-button" href={item.url} download={item.file.name} aria-label={`Download ${item.file.name}`}><ArrowDownToLine size={17}/></a></span></div>)}</div>}
          {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={14}/></button></div>}
          <footer className="footnote"><span><ShieldCheck size={14}/> Files stay in this browser session.</span><button onClick={() => setNotice("Upload a file, then copy its link to share.")}><MoreHorizontal size={16} aria-label="More information"/></button></footer>
        </div>
      </section>
    </main>
  );
}
