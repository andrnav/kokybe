import { tileStats, exposureStats, summarize, grayFromRgba } from './engine.js';

const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const canvasOf = (w,h)=>{ const c=document.createElement('canvas'); c.width=w;c.height=h;return c; };

function cropRect(photo) {
  const W=photo.width,H=photo.height, mode=photo.mode||'crop';
  if(mode==='free') {
    const b=photo.freeCrop||{x:0,y:0,w:W,h:H}, z=clamp(Number(photo.zoom||1),1,4);
    const sw=b.w/z,sh=b.h/z;
    const cx=b.x+b.w/2-clamp(Number(photo.pan?.x||0),-1,1)*(b.w-sw)/2;
    const cy=b.y+b.h/2-clamp(Number(photo.pan?.y||0),-1,1)*(b.h-sh)/2;
    return {sx:clamp(cx-sw/2,0,W-sw),sy:clamp(cy-sh/2,0,H-sh),sw,sh};
  }
  const fmt=photo.format==='custom'&&photo.customCm?photo.customCm:(photo.format?.cm||null);
  // Format IDs are resolved from the app's common format list below.
  const formats={'9x13':[8.9,12.7],'10x15':[10.2,15.2],'13x18':[12.7,17.8],'15x15':[15.2,15.2],'13x19':[12.7,19],'15x21':[15.2,21],'15x23':[15.2,22.8],'20x30':[20.3,30.5],'a4':[21,29.7],'30x30':[30.5,30.5],'30x40':[30.5,40],'a3':[29.7,42],'30x45':[30.5,45]};
  const cm=Array.isArray(photo.customCm)&&photo.format==='custom'?photo.customCm:(fmt||formats[photo.format]||[10,15]);
  const portrait=photo.orientation==='vertical'?true:photo.orientation==='horizontal'?false:H>=W;
  const ratio=portrait?cm[0]/cm[1]:cm[1]/cm[0];
  let bw,bh;if(W/H>ratio){bh=H;bw=H*ratio;}else{bw=W;bh=W/ratio;}
  const z=clamp(Number(photo.zoom||1),1,mode==='free'?4:3),sw=bw/z,sh=bh/z;
  const cx=W/2-clamp(Number(photo.pan?.x||0),-1,1)*(W-sw)/2;
  const cy=H/2-clamp(Number(photo.pan?.y||0),-1,1)*(H-sh)/2;
  return {sx:clamp(cx-sw/2,0,W-sw),sy:clamp(cy-sh/2,0,H-sh),sw,sh};
}

function histogramStats(rgba) {
  const hist=new Uint32Array(256), ch=[new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)];
  let n=0,mean=[0,0,0],dark=0,bright=0;
  for(let i=0;i<rgba.length;i+=4){const r=rgba[i],g=rgba[i+1],b=rgba[i+2],y=Math.round(.299*r+.587*g+.114*b);hist[y]++;ch[0][r]++;ch[1][g]++;ch[2][b]++;mean[0]+=r;mean[1]+=g;mean[2]+=b;n++;if(y<=8)dark++;if(y>=247)bright++;}
  const pct=(h,q)=>{let c=0;for(let i=0;i<256;i++){c+=h[i];if(c>=q*n)return i;}return 255;};
  return {p2:pct(hist,.02),p98:pct(hist,.98),contrastRange:pct(hist,.98)-pct(hist,.02),darkPct:dark/n*100,brightPct:bright/n*100,
    channelClip:{rDark:pct(ch[0],.01),rBright:pct(ch[0],.99),gDark:pct(ch[1],.01),gBright:pct(ch[1],.99),bDark:pct(ch[2],.01),bBright:pct(ch[2],.99)},
    meanRGB:mean.map(v=>v/n),meanLuma:hist.reduce((s,v,i)=>s+v*i,0)/n};
}
function jpegInfo(file) {
  return file?.arrayBuffer ? file.arrayBuffer().then(buf=>{
    const d=new DataView(buf); if(d.byteLength<4||d.getUint16(0)!==0xffd8)return null;
    let p=2,tables=[];
    while(p+4<d.byteLength){if(d.getUint8(p)!==0xff)break;const marker=d.getUint8(p+1);p+=2;if(marker===0xd9||marker===0xda)break;
      const len=d.getUint16(p);if(len<2||p+len>d.byteLength)break;
      if(marker===0xdb){let q=p+2;while(q<p+len){const info=d.getUint8(q++),prec=info>>4,id=info&15,n=prec?128:64;let sum=0;for(let k=0;k<64;k++)sum+=prec?d.getUint16(q+k*2):d.getUint8(q+k);tables.push({id,average:sum/64,precision:prec});q+=n;}}
      p+=len;
    }
    return {quantizationTables:tables,avgQuantization:tables.length?tables.reduce((s,t)=>s+t.average,0)/tables.length:null};
  }).catch(()=>null):Promise.resolve(null);
}
function advancedStats(rgba,w,h,tiles) {
  const gray=grayFromRgba(rgba,w,h), hist=new Uint32Array(256);
  let gx2=0,gy2=0,gxy=0,block=0,blockN=0,edge=0,edgeN=0, chroma=0,chromaN=0, satSum=0,labA=0,labB=0,labN=0;
  const at=(x,y)=>gray[y*w+x];
  for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
    const i=y*w+x,v=gray[i];hist[Math.round(v)]++;
    const gx=at(x+1,y)-at(x-1,y),gy=at(x,y+1)-at(x,y-1);gx2+=gx*gx;gy2+=gy*gy;gxy+=gx*gy;
    if(x%8===0){block+=Math.abs(v-at(x-1,y));blockN++;}
    if(y%8===0){block+=Math.abs(v-at(x,y-1));blockN++;}
    edge+=Math.abs(v-at(x-1,y));edgeN++;
    const k=i*4,r=rgba[k],g=rgba[k+1],b=rgba[k+2],Y=.299*r+.587*g+.114*b;
    chroma+=Math.abs(r-Y)+Math.abs(b-Y);chromaN++;
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b);satSum+=(mx-mn);
    labA+=r-g;labB+=g-b;labN++;
  }
  const n=hist.reduce((a,b)=>a+b,0),pct=q=>{let s=0;for(let i=0;i<256;i++){s+=hist[i];if(s>=q*n)return i;}return 255;};
  const trace=gx2+gy2, anisotropy=trace?Math.sqrt((gx2-gy2)**2+4*gxy*gxy)/trace:0;
  const avgEdge=edgeN?edge/edgeN:0, blockiness=blockN?block/blockN:0;
  const avgChroma=chromaN?chroma/chromaN:0;
  return {p2:pct(.02),p98:pct(.98),blockiness,edgeStrength:avgEdge,blockRatio:avgEdge?blockiness/avgEdge:0,
    gradientAnisotropy:anisotropy,possibleDirectionalBlur:anisotropy>.72&&avgEdge<18,
    chromaNoiseProxy:avgChroma,saturationMean:labN?satSum/labN:0,colorCast:{redGreen:labN?labA/labN:0,greenBlue:labN?labB/labN:0}};
}
function makeHeatmap(tiles,W,H) {
  const c=canvasOf(560,Math.max(1,Math.round(560*H/W))),ctx=c.getContext('2d');
  ctx.fillStyle='#253044';ctx.fillRect(0,0,c.width,c.height);
  for(const t of tiles){const x=t.x/W*c.width,y=t.y/H*c.height,ww=t.size/W*c.width,hh=t.size/H*c.height;
    const v=t.sharpScore??t.lapVar;const bad=v<25,mid=v<80;
    ctx.fillStyle=bad?'rgba(239,68,68,.48)':mid?'rgba(245,181,55,.35)':'rgba(34,197,94,.25)';
    ctx.fillRect(x,y,ww,hh);
  }
  return c.toDataURL('image/png');
}
export async function analyzePhoto(photo) {
  const img=photo.image,W=photo.width,H=photo.height,rect=(photo.mode==='fit'?{sx:0,sy:0,sw:W,sh:H}:cropRect(photo));
  const rw=Math.max(1,Math.round(rect.sw)),rh=Math.max(1,Math.round(rect.sh));
  // Keep original crop dimensions where feasible; downsample only for broad histogram/heatmap.
  const scale=Math.min(1,1800/Math.max(rw,rh)),w=Math.max(1,Math.round(rw*scale)),h=Math.max(1,Math.round(rh*scale));
  const c=canvasOf(w,h),ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingQuality='high';ctx.drawImage(img,rect.sx,rect.sy,rect.sw,rect.sh,0,0,w,h);
  const rgba=ctx.getImageData(0,0,w,h).data, exposure=exposureStats(rgba),hist=histogramStats(rgba);
  const T=Math.min(256,w,h),tiles=[];
  if(T>=24){const nx=Math.min(8,Math.max(1,Math.floor(w/T))),ny=Math.min(8,Math.max(1,Math.floor(h/T))),tc=canvasOf(T,T),tx=tc.getContext('2d',{willReadFrequently:true});
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const x=Math.round((w-T)*(nx===1?.5:i/(nx-1))),y=Math.round((h-T)*(ny===1?.5:j/(ny-1)));tx.drawImage(c,x,y,T,T,0,0,T,T);tiles.push({x,y,size:T,...tileStats(tx.getImageData(0,0,T,T).data,T,T)});}
  }
  const metrics=summarize(tiles,exposure);
  const adv=advancedStats(rgba,w,h,tiles);
  const jpeg=await jpegInfo(photo.originalFile);
  const lowTexture=metrics.sharp==null||metrics.sharp<25;
  const upscaled=detectUpscale(rgba,w,h);
  const compression=jpeg?.avgQuantization==null?null:jpeg.avgQuantization;
  const blockScore=adv.blockRatio;
  const findings=[];
  if(metrics.sharp!=null&&metrics.sharp<25)findings.push({id:'blur',level:'bad',text:'Nuotrauka gali būti stipriai išplaukusi.'});
  else if(metrics.sharp!=null&&metrics.sharp<80)findings.push({id:'blur',level:'warn',text:'Nuotrauka gali būti šiek tiek neryški.'});
  if(metrics.noise>=4.5)findings.push({id:'noise',level:'warn',text:'Matomas didesnis vaizdo grūdėtumas.'});
  if(hist.brightPct>=8)findings.push({id:'highlights',level:'warn',text:'Dalis šviesių vietų gali būti be detalių.'});
  if(hist.darkPct>=8)findings.push({id:'shadows',level:'warn',text:'Dalis tamsių vietų gali būti be detalių.'});
  if(hist.contrastRange<80)findings.push({id:'contrast',level:'warn',text:'Nuotrauka gali atrodyti blanki, jos tonų skirtumas nedidelis.'});
  if(upscaled.score>.35)findings.push({id:'upscale',level:'warn',text:'Aptikta galimo dirbtinio padidinimo požymių.'});
  if(blockScore>.22)findings.push({id:'jpeg',level:'warn',text:'Galimi JPEG blokų suspaudimo artefaktai.'});
  if(adv.possibleDirectionalBlur)findings.push({id:'motion',level:'warn',text:'Galimas kryptinis judesio arba fokusavimo susiliejimas.'});
  return {...metrics, crop:{x:rect.sx,y:rect.sy,w:rect.sw,h:rect.sh}, analyzedSize:{w,h}, histogram:hist,advanced:adv,
    jpeg:{...jpeg,blockRatio:blockScore},upscale:upscaled,findings,heatmap:makeHeatmap(tiles,w,h),
    tiles:tiles.map(t=>({x:t.x,y:t.y,sharp:t.lapVar,noise:t.sigma})) , w:rw,h:rh};
}
function detectUpscale(rgba,w,h){
  // Heuristic only: repeated/interpolated pixel patterns, not a reliable recovery of source dimensions.
  const step=Math.max(1,Math.floor(Math.min(w,h)/700));let same=0,total=0,flat=0;
  for(let y=2;y<h-2;y+=step)for(let x=2;x<w-2;x+=step){const i=(y*w+x)*4;
    const dx=Math.abs(rgba[i]-rgba[i+4])+Math.abs(rgba[i+1]-rgba[i+5])+Math.abs(rgba[i+2]-rgba[i+6]);
    const d2=Math.abs(rgba[i]-rgba[i+8])+Math.abs(rgba[i+1]-rgba[i+9])+Math.abs(rgba[i+2]-rgba[i+10]);
    if(dx<2&&d2>5)same++;if(dx<1)flat++;total++;
  }
  return {score:total?same/total:0,repeatedRatio:total?flat/total:0,likely:total>0&&same/total>.35};
}
