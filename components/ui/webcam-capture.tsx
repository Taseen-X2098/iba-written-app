"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X, RefreshCw } from "lucide-react";

interface Props {
  onCapture: (file: File) => void;
  onCancel: () => void;
}

export function WebcamCapture({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const startCamera = async (mode: "environment" | "user") => {
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode },
        audio: false
      });
      
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setError(null);
    } catch (err: any) {
      setError("Camera access denied or unavailable. Please check your permissions.");
      console.error(err);
    }
  };

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
        
        // Stop stream after capture
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      }
    }, "image/jpeg", 0.9);
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
  };

  if (error) {
    return (
      <div className="bg-destructive/10 text-destructive p-4 rounded-xl flex flex-col items-center text-center gap-3 w-full">
        <p className="text-sm">{error}</p>
        <button 
          onClick={onCancel}
          className="bg-background px-4 py-1.5 rounded-lg text-xs font-semibold border border-destructive/20 hover:bg-destructive/10 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-sm mx-auto bg-black rounded-2xl overflow-hidden shadow-xl aspect-[3/4] sm:aspect-video flex flex-col">
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className="w-full h-full object-cover bg-neutral-900"
      />
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Overlay UI */}
      <div className="absolute inset-0 flex flex-col justify-between p-4 pointer-events-none">
        <div className="flex justify-between items-start pointer-events-auto">
          <button 
            onClick={onCancel}
            className="p-2 bg-black/50 text-white rounded-full hover:bg-black/70 backdrop-blur-sm transition-colors"
          >
            <X size={20} />
          </button>
          
          <button 
            onClick={toggleCamera}
            className="p-2 bg-black/50 text-white rounded-full hover:bg-black/70 backdrop-blur-sm transition-colors"
          >
            <RefreshCw size={20} />
          </button>
        </div>
        
        <div className="flex justify-center pb-2 pointer-events-auto">
          <button 
            onClick={handleCapture}
            className="h-16 w-16 border-4 border-white/80 rounded-full bg-white/30 hover:bg-white/50 backdrop-blur-sm transition-colors flex items-center justify-center"
          >
            <div className="h-12 w-12 bg-white rounded-full shadow-sm" />
          </button>
        </div>
      </div>
    </div>
  );
}
