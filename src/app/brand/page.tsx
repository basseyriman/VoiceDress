"use client";

import { Logo } from "@/components/ui/button";
import { useCallback } from "react";
import * as htmlToImage from "html-to-image";

function DownloadButton({ targetId, filename }: { targetId: string, filename: string }) {
  const download = useCallback(async () => {
    const el = document.getElementById(targetId);
    if (!el) return;
    try {
      const dataUrl = await htmlToImage.toPng(el, { quality: 1, pixelRatio: 1 });
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to download image", err);
      alert("Failed to generate image. Try screenshotting instead.");
    }
  }, [targetId, filename]);

  return (
    <button 
      onClick={download}
      className="mt-6 px-8 py-3 bg-champagne text-ink rounded-full font-medium tracking-wide hover:bg-champagne/80 transition-colors shadow-lg"
    >
      Download High-Res PNG
    </button>
  );
}

// A reusable component for the core mockup so we don't repeat the crazy absolute positioning code
function PhoneAndPolaroids({ scale = "scale-[1.0]" }: { scale?: string }) {
  return (
    <div className={`relative flex justify-center items-center ${scale} origin-top mt-12`}>
      <div className="relative z-10 w-[430px] h-[932px] rounded-[3.5rem] bg-black p-4 shadow-2xl shadow-black/40 border-[4px] border-[#3F3F3F]">
        {/* Dynamic Island */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 w-32 h-9 bg-black rounded-full z-50"></div>
        
        {/* Screen Content (Live App iframe) */}
        <div className="w-full h-full rounded-[3rem] overflow-hidden bg-ink relative">
          <iframe src="/" className="w-[430px] h-[932px] border-0 scale-[1.0] origin-top-left pointer-events-none" />
        </div>

        {/* Overlapping Floating Polaroid/Photo (Left - Input) */}
        <div className="absolute -left-64 top-40 w-[350px] aspect-[3/4] bg-white p-4 pb-16 shadow-2xl -rotate-[12deg] rounded-lg -z-10">
          <div className="w-full h-full bg-[#f4f2f0] rounded-sm overflow-hidden pb-0 relative">
            <img 
              src="/clothes-hanger.png" 
              alt="Wardrobe Input" 
              className="w-full h-full object-cover scale-[1.1] object-center"
            />
          </div>
          <div className="absolute bottom-6 left-6 font-medium text-ink/40 tracking-wider text-sm uppercase">
            Your Wardrobe
          </div>
        </div>

        {/* Overlapping Floating Polaroid/Photo (Right - Output) */}
        <div className="absolute -right-64 -bottom-12 w-[450px] aspect-[3/4] bg-white p-4 pt-12 shadow-2xl rotate-[12deg] rounded-lg z-30">
          <div className="w-full h-full bg-gray-100 rounded-sm overflow-hidden pb-0 relative">
            <img 
              src="/model-outfit.jpg" 
              alt="Fashion Model" 
              className="w-full h-full object-cover scale-[1.2] object-top"
            />
          </div>
          <div className="absolute top-4 right-6 font-medium text-ink/40 tracking-wider text-sm uppercase">
            Try on with VoiceDress
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BrandFlyersPage() {
  return (
    <div className="min-h-screen bg-ink/90 p-8 text-ivory flex flex-col items-center gap-24 pb-32">
      <div className="text-center max-w-2xl mt-8">
        <h1 className="font-display text-4xl mb-4 text-champagne">VoiceDress Marketing Kit</h1>
        <p className="text-mist">
          Here is the exact same Mockup Showcase designed perfectly for every social media platform. 
          Click Download and upload them directly!
        </p>
      </div>

      {/* Instagram & LinkedIn Feed (1080 x 1350) - 4:5 Aspect Ratio */}
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm text-mist tracking-widest uppercase">Instagram Feed / LinkedIn Post (4:5)</span>
        <div 
          id="flyer-feed"
          className="relative overflow-hidden bg-gradient-to-b from-[#E8F0EE] to-[#E3E4E8] border border-line flex flex-col items-center pt-24"
          style={{ width: 1080, height: 1350 }}
        >
          {/* Header Text */}
          <div className="relative z-20 flex flex-col items-center text-center px-8 mb-6 text-[#1C2621]">
            <div className="flex items-center gap-3 mb-8">
              <Logo variant="hero" theme="light" />
            </div>
            <h2 className="font-display text-[4.2rem] leading-[1.1] font-bold tracking-tight mb-6">
              Improve Your Outfits<br/>With VoiceDress!
            </h2>
            <p className="text-2xl font-light max-w-2xl opacity-80">
              Let VoiceDress suggest the perfect outfit based on your wardrobe, just by speaking to it.
            </p>
          </div>

          {/* Grouped Mockup Scaled down slightly to fit 1080px width */}
          <PhoneAndPolaroids scale="scale-[0.85]" />
          
          <div className="absolute bottom-10 left-10 z-40">
            <span className="text-[#1C2621]/40 tracking-[0.3em] uppercase text-xl font-medium">voicedress.com</span>
          </div>
        </div>
        <DownloadButton targetId="flyer-feed" filename="voicedress-ig-feed.png" />
      </div>

      {/* TikTok / Stories / WhatsApp Status (1080 x 1920) - 9:16 Aspect Ratio */}
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm text-mist tracking-widest uppercase">TikTok / IG Stories / WhatsApp Status (9:16)</span>
        <div 
          id="flyer-story"
          className="relative overflow-hidden bg-gradient-to-b from-[#E8F0EE] to-[#E3E4E8] border border-line flex flex-col items-center pt-40"
          style={{ width: 1080, height: 1920 }}
        >
          {/* Header Text */}
          <div className="relative z-20 flex flex-col items-center text-center px-8 mb-20 text-[#1C2621]">
            <div className="flex items-center gap-3 mb-10">
              <Logo variant="hero" theme="light" />
            </div>
            <h2 className="font-display text-[4.5rem] leading-[1.1] font-bold tracking-tight mb-8">
              Improve Your Outfits<br/>With VoiceDress!
            </h2>
            <p className="text-3xl font-light max-w-2xl opacity-80 leading-relaxed">
              Let VoiceDress suggest the perfect outfit based on your wardrobe, just by speaking to it.
            </p>
          </div>

          {/* Grouped Mockup Scaled down to fit mobile width beautifully */}
          <PhoneAndPolaroids scale="scale-[0.85]" />
          
          <div className="absolute bottom-16 left-0 w-full flex justify-center z-40">
            <div className="bg-[#1C2621]/10 px-8 py-4 rounded-full backdrop-blur-md">
              <span className="text-[#1C2621]/60 tracking-[0.3em] uppercase text-xl font-bold">voicedress.com</span>
            </div>
          </div>
        </div>
        <DownloadButton targetId="flyer-story" filename="voicedress-story.png" />
      </div>

    </div>
  );
}
