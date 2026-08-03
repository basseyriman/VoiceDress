import { Logo } from "@/components/ui/button";

export default function BrandFlyersPage() {
  return (
    <div className="min-h-screen bg-ink/90 p-8 text-ivory flex flex-col items-center gap-12 pb-32">
      <div className="text-center max-w-2xl">
        <h1 className="font-display text-4xl mb-4 text-champagne">VoiceDress Brand Flyers</h1>
        <p className="text-mist">
          Take a screenshot of these perfectly branded flyers to announce the app on social media. They use your exact app fonts, logo, and colors.
        </p>
      </div>

      {/* Essembl-style App Mockup (1200 x 1400) */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-mist tracking-widest uppercase">App Mockup Showcase</span>
        <div 
          className="relative overflow-hidden bg-gradient-to-b from-[#E8F0EE] to-[#E3E4E8] border border-line flex flex-col items-center pt-24"
          style={{ width: 1200, height: 1400 }}
        >
          {/* Header Text */}
          <div className="relative z-20 flex flex-col items-center text-center px-12 mb-20 text-[#1C2621]">
            <div className="flex items-center gap-3 mb-8">
              <Logo variant="hero" theme="light" />
            </div>
            
            <h2 className="font-display text-[4.5rem] leading-[1.1] font-bold tracking-tight mb-6">
              Improve Your Outfits<br/>With VoiceDress!
            </h2>
            <p className="text-2xl font-light max-w-2xl opacity-80">
              Let VoiceDress suggest the perfect outfit based on your wardrobe, just by speaking to it.
            </p>
          </div>

          {/* The Phone Mockup */}
          <div className="relative z-10 w-[430px] h-[932px] rounded-[3.5rem] bg-black p-4 shadow-2xl shadow-black/40 border-[4px] border-[#3F3F3F]">
            {/* Dynamic Island */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 w-32 h-9 bg-black rounded-full z-50"></div>
            
            {/* Screen Content (Live App iframe) */}
            <div className="w-full h-full rounded-[3rem] overflow-hidden bg-ink relative">
              <iframe src="/" className="w-[430px] h-[932px] border-0 scale-[1.0] origin-top-left pointer-events-none" />
            </div>

            {/* Overlapping Floating Polaroid/Photo */}
            <div className="absolute -right-64 -bottom-12 w-[450px] aspect-[3/4] bg-white p-4 shadow-2xl rotate-[12deg] rounded-lg z-30">
              <div className="w-full h-full bg-gray-100 rounded-sm overflow-hidden pb-0 relative">
                <img 
                  src="/model-outfit.jpg" 
                  alt="Fashion Model" 
                  className="w-full h-full object-cover scale-[1.2] object-top"
                />
              </div>
              {/* Text Label - Bag Area */}
              <div className="absolute bottom-12 left-12 z-50 flex items-center bg-[#e3d5c8]/90 backdrop-blur-md text-ink px-4 py-2 rounded-full font-medium tracking-wide shadow-xl text-sm gap-2 whitespace-nowrap">
                <div className="w-2 h-2 bg-[#9A5B30] rounded-full animate-pulse"></div>
                Try on with VoiceDress
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Twitter / LinkedIn (1200 x 675) */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-mist tracking-widest uppercase">Twitter / LinkedIn Banner (16:9)</span>
        <div 
          className="relative overflow-hidden bg-ink border border-line flex flex-col justify-center items-center"
          style={{ width: 1200, height: 675 }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-champagne/10 via-ink to-ink"></div>
          <div className="relative z-10 flex flex-col items-center text-center">
            <Logo variant="hero" />
            <h1 className="mt-8 font-display text-7xl font-medium italic text-ivory tracking-wide">
              Dress without deciding.
            </h1>
            <p className="mt-6 text-2xl text-mist max-w-2xl leading-relaxed">
              The world's first voice-powered AI stylist. Talk to your wardrobe and see yourself dressed in seconds.
            </p>
            <div className="mt-12 rounded-full border border-champagne/30 bg-champagne/10 px-8 py-3 text-champagne text-lg font-medium tracking-widest uppercase">
              Now Live
            </div>
          </div>
        </div>
      </div>

      {/* Instagram Square (1080 x 1080) */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-mist tracking-widest uppercase">Instagram Post (1:1)</span>
        <div 
          className="relative overflow-hidden bg-ink border border-line flex flex-col justify-between p-24"
          style={{ width: 1080, height: 1080 }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-ink via-ink to-champagne/10"></div>
          
          <div className="relative z-10 flex justify-between items-start w-full">
            <Logo variant="header" />
            <div className="text-champagne font-display italic text-2xl">v1.0</div>
          </div>

          <div className="relative z-10 w-full">
            <h2 className="font-display text-[5.5rem] leading-[1.1] text-ivory mb-8">
              Your virtual<br/>fitting room,<br/><span className="italic text-champagne">powered by voice.</span>
            </h2>
            <div className="flex flex-col gap-4 text-2xl text-mist font-light">
              <div className="flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-champagne"></div>
                Upload your clothes (or screenshots)
              </div>
              <div className="flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-champagne"></div>
                Say the occasion & weather
              </div>
              <div className="flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-champagne"></div>
                See the outfit styled on your body
              </div>
            </div>
          </div>

          <div className="relative z-10 text-xl tracking-[0.2em] uppercase text-champagne/70">
            voicedress.com
          </div>
        </div>
      </div>

      {/* Instagram Story (1080 x 1920) */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-mist tracking-widest uppercase">Instagram / TikTok Story (9:16)</span>
        <div 
          className="relative overflow-hidden bg-ink border border-line flex flex-col items-center justify-center p-16"
          style={{ width: 1080, height: 1920 }}
        >
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200&q=80')] bg-cover bg-center opacity-20"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/80 to-transparent"></div>
          
          <div className="relative z-10 flex flex-col items-center h-full justify-end pb-32 text-center">
            <Logo variant="hero" />
            
            <div className="mt-16 bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8 mb-16 max-w-sm">
              <p className="text-3xl text-ivory font-display italic">
                "I have a dinner date tonight. Give me something elegant."
              </p>
            </div>

            <h2 className="font-display text-[6rem] leading-none text-ivory mb-6">
              Stop scrolling.
            </h2>
            <h2 className="font-display text-[6rem] leading-none text-champagne italic mb-12">
              Start speaking.
            </h2>
            
            <p className="text-3xl text-mist max-w-md mx-auto mb-16 leading-relaxed">
              The AI stylist that dresses you in seconds.
            </p>

            <div className="rounded-full border-2 border-champagne bg-champagne text-ink px-12 py-6 text-2xl font-bold tracking-widest uppercase">
              Try It Now
            </div>
            
            <div className="mt-12 text-2xl tracking-[0.2em] uppercase text-ivory/50">
              voicedress.com
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
