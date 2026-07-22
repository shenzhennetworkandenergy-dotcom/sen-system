"use client";
import { useRef, useState } from "react";

type Detector = { detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;

export function SerialScanner(){
  const [message,setMessage]=useState(""); const video=useRef<HTMLVideoElement>(null);
  async function scan(){
    const DetectorClass=(window as unknown as {BarcodeDetector?:DetectorConstructor}).BarcodeDetector;
    if(!DetectorClass||!navigator.mediaDevices?.getUserMedia){setMessage("Camera scanning is not supported in this browser. Use manual or keyboard-scanner input.");return;}
    try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}}); if(!video.current)return; video.current.srcObject=stream; await video.current.play(); const detector=new DetectorClass({formats:["qr_code","code_128"]});
      for(let attempt=0;attempt<80;attempt++){const found=await detector.detect(video.current);if(found[0]?.rawValue){const value=found[0].rawValue.replace(/^SEN:1:/,""); const input=document.querySelector<HTMLInputElement>('input[name="q"]');if(input){input.value=value;input.form?.requestSubmit();} setMessage("Code detected.");break;}await new Promise((resolve)=>setTimeout(resolve,150));} stream.getTracks().forEach((track)=>track.stop());
    }catch{setMessage("Camera was unavailable or permission was denied. Manual scanning remains available.");}
  }
  return <div className="rounded-xl border bg-[var(--surface)] p-4"><div className="flex flex-wrap items-center gap-3"><button type="button" onClick={scan} className="rounded border px-4 py-2 font-semibold">Scan with camera</button><span className="text-sm text-[var(--muted-text)]">Camera is used only for this explicit scan and images are not stored.</span></div><video ref={video} muted playsInline className="mt-3 hidden max-h-64 w-full rounded bg-black"/><p aria-live="polite" className="mt-2 text-sm">{message}</p></div>;
}
