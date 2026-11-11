// Catalogue browsing stays local and separate from the active exercise.
export const LIBRARY_FIELDS=['composer','era','style','difficulty'];
export function libraryValue(piece,field) {
  return typeof piece?.[field]==='string' && piece[field].trim() ? piece[field].trim() : 'Unrated';
}
export function libraryFacets(pieces,field) {
  return [...new Set(pieces.map(piece=>libraryValue(piece,field)))].sort((a,b)=>a.localeCompare(b,'en'));
}
function searchable(value) {
  return String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en')
    .replace(/[#♯]/g,'sharp').replace(/♭/g,'flat').replace(/[^\p{L}\p{N}]/gu,'');
}
export function filterLibrary(pieces,filters={}) {
  const tokens=(typeof filters.query==='string' ? filters.query.slice(0,120) : '').split(/\s+/).map(searchable).filter(Boolean);
  return pieces.filter(piece=>LIBRARY_FIELDS.every(field=>!filters[field] || libraryValue(piece,field)===filters[field]) &&
    (!tokens.length || tokens.every(token=>searchable([piece.title,piece.composer,piece.source_title,piece.id,...LIBRARY_FIELDS.map(field=>libraryValue(piece,field))].join(' ')).includes(token))))
    .slice().sort((a,b)=>`${a.composer} ${a.title}`.localeCompare(`${b.composer} ${b.title}`,'en'));
}

export function randomLibraryPiece(pieces,filters={},currentId='',random=Math.random) {
  const matches=filterLibrary(pieces,filters);
  const pool=matches.length>1 ? matches.filter(piece=>piece.id!==currentId) : matches;
  if(!pool.length) return null;
  const value=Number(random()), index=Number.isFinite(value) ? Math.max(0,Math.min(pool.length-1,Math.floor(value*pool.length))) : 0;
  return pool[index];
}


// Only public catalogue identities are remembered; no filenames, paths or music data.
function cleanRecent(value) {
  const seen=new Set();
  return (Array.isArray(value) ? value : []).slice(0,20).filter(entry=>{
    if(!entry || typeof entry.id!=='string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(entry.id) ||
      typeof entry.sha256!=='string' || !/^[a-f0-9]{64}$/.test(entry.sha256) || seen.has(entry.id)) return false;
    seen.add(entry.id); return true;
  }).map(({id,sha256})=>({id,sha256}));
}
export function parseRecentLibrary(text) {
  if(typeof text!=='string' || text.length>5000) throw new Error('Recent piece data is too large.');
  const value=JSON.parse(text);
  if(value?.version!==1 || !Array.isArray(value.pieces)) throw new Error('Unsupported recent piece format.');
  return cleanRecent(value.pieces);
}
export function rememberLibraryPiece(recent,piece) {
  const entry=cleanRecent([piece])[0];
  if(!entry) throw new Error('Invalid recent piece identity.');
  return [entry,...cleanRecent(recent).filter(item=>item.id!==entry.id)].slice(0,20);
}
export function recentLibraryPieces(pieces,recent) {
  const catalogue=new Map(pieces.map(piece=>[piece.id,piece]));
  return cleanRecent(recent).flatMap(entry=>{
    const piece=catalogue.get(entry.id);
    return piece?.sha256===entry.sha256 ? [piece] : [];
  });
}
