"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowDownToLine, Eye, File, Link2, LockKeyhole } from "lucide-react";

type ShareItem = { id: string; name: string; size: number; contentType: string; folderId: string | null; protected: boolean };
type ShareFolder = { id: string; name: string; parentId: string | null; protected: boolean };

export default function SharePage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<ShareItem | null>(null);
  const [folders, setFolders] = useState<ShareFolder[]>([]);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"open" | "download" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    void fetch("/api/library", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Could not load this shared file.");
      const data = await response.json() as { files: ShareItem[]; folders: ShareFolder[] };
      const found = data.files.find((file) => file.id === id);
      if (!found) throw new Error("This shared file was removed or is unavailable.");
      setItem(found);
      setFolders(data.folders);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load this file."))
      .finally(() => setLoading(false));
  }, [id]);

  async function access(mode: "open" | "download") {
    if (!item) return;
    setBusy(mode); setError("");
    try {
      const chain: ShareFolder[] = [];
      let folder = folders.find((entry) => entry.id === item.folderId);
      while (folder) { chain.unshift(folder); folder = folders.find((entry) => entry.id === folder?.parentId); }
      const passwords: Record<string, string> = {};
      for (const protectedFolder of chain.filter((entry) => entry.protected)) {
        const value = window.prompt(`Enter the password for folder "${protectedFolder.name}"`);
        if (value === null) { setBusy(null); return; }
        passwords[protectedFolder.id] = value;
      }
      if (item.protected) passwords[item.id] = password;
      const response = await fetch(`/api/files/${item.id}/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passwords }) });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "Could not open this file.");
      const result = await response.json() as { url: string };
      window.location.assign(`${result.url}${mode === "download" ? "&download=1" : ""}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open this file. Check the password and try again."); }
    finally { setBusy(null); }
  }

  return <main className="share-page"><a className="brand" href="/" aria-label="Folio public workspace"><span className="brand-mark"><Link2 size={20}/></span><span>folio<span className="brand-dot">.</span></span></a><section className="share-card"><div className="share-icon">{item?.protected ? <LockKeyhole size={22}/> : <File size={22}/>}</div><p className="eyebrow">PUBLIC FILE SHARE</p><h1>{loading ? "Loading shared file…" : item?.name ?? "Shared file unavailable"}</h1>{item && <p className="share-type">{item.contentType} · {item.size < 1024 * 1024 ? `${Math.max(1, Math.round(item.size / 1024))} KB` : `${(item.size / (1024 * 1024)).toFixed(1)} MB`}</p>}{item?.protected && <label className="share-password">File password<input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" required/></label>}{error && <p className="share-error" role="alert">{error}</p>}{item && <form className="share-actions" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void access("open"); }}><button className="browse-button" disabled={Boolean(busy) || loading || (item.protected && password.length === 0)} type="submit">{busy === "open" ? "Opening…" : <><Eye size={16}/> Open file</>}</button><button className="share-download" disabled={Boolean(busy) || loading || (item.protected && password.length === 0)} onClick={() => void access("download")} type="button">{busy === "download" ? "Preparing…" : <><ArrowDownToLine size={16}/> Download</>}</button></form>}{!item && !loading && <a href="/" className="share-back">Back to the public library</a>}</section></main>;
}
