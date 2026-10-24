import { useEffect, useMemo, useState } from 'react';
import { loadNativeGalleryImage, loadNativeGalleryPhotos, type NativeGalleryPhoto } from './native/nativeImagePicker';

import { showToast } from './toast';
type Props = { onClose: () => void; onSelect: (file: File) => void | Promise<void> };

export default function NativeGalleryModal({ onClose, onSelect }: Props) {
  const [photos, setPhotos] = useState<NativeGalleryPhoto[]>([]);
  const [album, setAlbum] = useState('All photos');
  const [selected, setSelected] = useState<NativeGalleryPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [albumsOpen, setAlbumsOpen] = useState(false);

  useEffect(() => { if (error) showToast(error, 'error'); }, [error]);

  useEffect(() => {
    let active = true;
    loadNativeGalleryPhotos().then(items => { if (active) { setPhotos(items); if (items.length) setSelected(items[0]); } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to access your photos.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const albums = useMemo(() => ['All photos', ...Array.from(new Set(photos.map(p => p.album).filter(Boolean))).sort((a, b) => a.localeCompare(b))], [photos]);
  const visible = album === 'All photos' ? photos : photos.filter(p => p.album === album);
  const choose = async () => {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try { await onSelect(await loadNativeGalleryImage(selected)); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to open the selected photo.'); }
    finally { setBusy(false); }
  };

  const line = 'rgba(225,230,238,.15)';
  const panel = 'rgba(20,21,25,.94)';
  const control = { border: '1px solid ' + line, borderRadius: 13, color: '#f1f3f6', background: 'rgba(255,255,255,.055)' };
  return <div role="dialog" aria-modal="true" aria-label="Choose a photo" style={{position:'fixed',inset:0,zIndex:10050,display:'flex',flexDirection:'column',background:'radial-gradient(ellipse at 50% 0%, rgba(205,214,228,.09), transparent 48%),rgba(5,5,6,.98)',color:'#f3f4f6',fontFamily:'inherit',backdropFilter:'blur(24px)'}}>
    <header style={{display:'flex',alignItems:'center',gap:12,padding:'calc(13px + env(safe-area-inset-top)) 15px 13px',background:'rgba(15,16,19,.92)',borderBottom:'1px solid '+line}}>
      <button type="button" onClick={onClose} aria-label="Close gallery" style={{...control,width:42,height:42,fontSize:22,flexShrink:0}}>‹</button>
      <button type="button" onClick={()=>setAlbumsOpen(v=>!v)} aria-expanded={albumsOpen} style={{flex:1,minWidth:0,textAlign:'left',border:0,background:'transparent',color:'#f4f5f7',fontSize:16,fontWeight:700}}>
        <span style={{display:'block'}}>Choose photo</span><small style={{display:'flex',alignItems:'center',gap:6,color:'#aeb2bb',fontSize:11,fontWeight:400,marginTop:3}}>{album} <span style={{fontSize:14}}>⌄</span></small>
      </button>
      <span style={{fontSize:10,letterSpacing:'.12em',color:'#cbd1da'}}>KINGSHALL</span>
    </header>
    {albumsOpen && <div style={{padding:10,display:'flex',flexWrap:'wrap',gap:7,background:panel,borderBottom:'1px solid '+line}}>{albums.map(name=><button type="button" key={name} onClick={()=>{setAlbum(name);setAlbumsOpen(false);setSelected(null)}} style={{...control,padding:'9px 12px',fontSize:12,background:album===name?'rgba(220,226,235,.16)':'rgba(255,255,255,.035)',borderColor:album===name?'rgba(230,235,243,.38)':line}}>{name}</button>)}</div>}
    <main style={{flex:1,minHeight:0,overflowY:'auto',padding:10}}>
      {loading ? <div style={{minHeight:180,display:'grid',placeItems:'center',color:'#b8bdc6',fontSize:12}}>Loading photos…</div> :
      error && !photos.length ? <div style={{padding:24,textAlign:'center',color:'#aeb2bb',fontSize:13}}>No photos available.</div> :
      !visible.length ? <div style={{padding:28,textAlign:'center',color:'#aeb2bb',fontSize:13}}>No photos in this album.</div> :
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:5}}>{visible.map(photo=><button type="button" key={photo.id} aria-label={'Select '+photo.name} aria-pressed={selected?.id===photo.id} onClick={()=>setSelected(photo)} style={{position:'relative',padding:0,aspectRatio:'1',overflow:'hidden',borderRadius:9,border:selected?.id===photo.id?'2px solid #e1e6ee':'1px solid rgba(255,255,255,.08)',background:'#101114',boxShadow:selected?.id===photo.id?'0 0 0 2px rgba(225,230,238,.12)':'none'}}>
        {photo.thumbnail ? <img src={photo.thumbnail} alt={photo.name} loading="lazy" style={{width:'100%',height:'100%',display:'block',objectFit:'cover'}}/> : <span style={{display:'grid',placeItems:'center',height:'100%',fontSize:20,color:'#aeb2bb'}}>▧</span>}
        {selected?.id===photo.id && <span style={{position:'absolute',top:5,right:5,width:21,height:21,display:'grid',placeItems:'center',borderRadius:'50%',background:'#e2e6ed',color:'#090a0c',fontSize:14,fontWeight:800}}>✓</span>}
      </button>)}</div>}
    </main>

    <footer style={{padding:'12px 14px calc(14px + env(safe-area-inset-bottom))',background:'rgba(15,16,19,.95)',borderTop:'1px solid '+line,boxShadow:'0 -12px 30px rgba(0,0,0,.22)'}}>
      {selected && <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}><div style={{width:38,height:38,borderRadius:9,overflow:'hidden',border:'1px solid '+line,flexShrink:0}}>{selected.thumbnail && <img src={selected.thumbnail} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>}</div><div style={{minWidth:0}}><strong style={{display:'block',fontSize:12}}>Selected photo</strong><small style={{display:'block',maxWidth:'70vw',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#aeb2bb',fontSize:10}}>{selected.name}</small></div></div>}
      <button type="button" disabled={!selected||busy} onClick={()=>void choose()} style={{width:'100%',minHeight:46,border:'1px solid rgba(245,247,250,.75)',borderRadius:13,background:selected&&!busy?'linear-gradient(120deg,#f1f3f6,#c4cbd5)':'rgba(255,255,255,.08)',color:selected&&!busy?'#090a0c':'#7c8088',fontSize:13,fontWeight:800}}>{busy?'Opening photo…':'Use selected photo'}</button>
    </footer>
  </div>;
}
