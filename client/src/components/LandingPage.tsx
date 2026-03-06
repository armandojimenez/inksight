import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { cn } from '@/lib/utils';
import { ArrowRight, ChevronRight } from 'lucide-react';

const CTA_BASE = 'rounded border-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)] min-h-[44px] inline-flex items-center justify-center';
const CTA_PRIMARY = `${CTA_BASE} border-primary-500 bg-primary-500 text-white hover:bg-primary-600 hover:border-primary-600`;
const CTA_SECONDARY = `${CTA_BASE} border-neutral-800 bg-white text-neutral-800 hover:bg-neutral-50`;

/* ------------------------------------------------------------------ */
/*  Inksight Logo SVG                                                  */
/* ------------------------------------------------------------------ */
function InksightLogo({ className }: { className?: string }) {
  return (
    <img
      src="/inksight-icon.png"
      alt=""
      aria-hidden="true"
      className={className}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Inkit Logo (official SVG wordmark from inkit.com)                  */
/* ------------------------------------------------------------------ */
function InkitLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 417 101"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Inkit"
    >
      <path d="M80.03 0.9V35.29l23.98 11.55-36.08 17.62v36.1l64.83-32.42a8.98 8.98 0 004.75-7.68V34.99a8.98 8.98 0 00-4.75-7.68L80.03.94z" fill="currentColor"/>
      <path d="M69.73.9L4.89 33.32A8.98 8.98 0 00.14 41v25.47a8.98 8.98 0 004.75 7.68l52.74 26.37V64.42L33.64 52.87l36.09-17.62V.87z" fill="currentColor"/>
      <path d="M166.15 20.05h12.48v53.97h-12.48V20.05z" fill="currentColor"/>
      <path d="M248.65 20.05v53.97h-10.25l-26.92-32.77v32.77h-12.33V20.05h10.33l26.83 32.77V20.05h12.34z" fill="currentColor"/>
      <path d="M291.71 52.82l-7.25 7.55v13.65h-12.42V20.05h12.42v25.22l23.9-25.22h13.88l-22.37 24.05 23.67 29.92h-14.57l-17.26-21.2z" fill="currentColor"/>
      <path d="M338.29 20.05h12.49v53.97h-12.49V20.05z" fill="currentColor"/>
      <path d="M387.03 30.24h-17.27V20.05h47.03v10.19h-17.27v43.8h-12.49V30.24z" fill="currentColor"/>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating viewfinder bracket (hero decoration, matches Inkit cubes) */
/* ------------------------------------------------------------------ */
function FloatingHexagon({
  className,
  style,
  size = 48,
}: {
  className?: string;
  style?: React.CSSProperties;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 250 250"
      width={size}
      height={size}
      className={cn('absolute text-primary-500 opacity-[0.12]', className)}
      style={style}
      aria-hidden="true"
    >
      <path
        d="M125 20 L220 70 L220 180 L125 230 L30 180 L30 70 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="12"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Reveal wrapper (scroll-triggered)                                  */
/* ------------------------------------------------------------------ */
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, isVisible } = useScrollReveal(0.1);
  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
        className,
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Static product mockups (wireframe style, like Inkit)               */
/* ------------------------------------------------------------------ */

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MockupUpload() {
  const [file, setFile] = useState<{ name: string; size: number; url: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith('image/')) {
      setError(`"${f.name}" is not an image. Please use PNG, JPG, or GIF.`);
      setFile(null);
      return;
    }
    setError(null);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(f);
    urlRef.current = url;
    setFile({ name: f.name, size: f.size, url });
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  return (
    <div className="rounded-lg border border-neutral-100 bg-white p-6 shadow-sm w-full max-w-[520px]" aria-label="Interactive upload demo">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif"
        className="sr-only"
        onChange={onFileChange}
        aria-label="Upload an image"
      />
      {/* Drop zone */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-3 rounded border-2 border-dashed px-6 transition-colors cursor-pointer focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)]',
          file ? 'border-primary-300 bg-primary-50 py-4' : 'border-neutral-200 bg-neutral-25 py-10',
          dragOver && !error && 'border-primary-400 bg-primary-100',
          error && 'border-error-500 bg-error-50',
        )}
      >
        {file ? (
          <img
            src={file.url}
            alt="Uploaded preview"
            className="max-h-40 w-auto rounded object-contain"
          />
        ) : (
          <>
            <div className={cn(
              'h-10 w-10 rounded-full flex items-center justify-center',
              error ? 'bg-error-50 text-error-500' : 'bg-primary-50 text-primary-500',
            )}>
              {error ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              )}
            </div>
            {error ? (
              <div className="text-sm text-error-600 text-center" role="alert">{error}</div>
            ) : (
              <div className="text-sm text-neutral-500 text-center">
                Drop an image here, or <span className="font-semibold text-primary-500">browse</span>
              </div>
            )}
            <div className="text-xs text-neutral-400">PNG, JPG, GIF up to 16 MB</div>
          </>
        )}
      </button>
      {/* File info bar */}
      <div className="mt-4 flex items-center gap-3 rounded bg-neutral-50 px-3 py-2.5">
        {file ? (
          <>
            <img src={file.url} alt="" aria-hidden="true" className="h-10 w-10 rounded object-cover flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-neutral-600 truncate">{file.name}</div>
              <div className="text-xs text-neutral-400 mt-0.5">{formatSize(file.size)}</div>
            </div>
          </>
        ) : (
          <>
            <div className="h-10 w-10 rounded bg-neutral-200 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="h-2.5 w-28 rounded bg-neutral-200" />
              <div className="mt-1.5 h-2 w-16 rounded bg-neutral-100" />
            </div>
          </>
        )}
        <div className={cn(
          'h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0',
          file ? 'bg-success-50' : 'bg-neutral-100',
        )}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={file ? 'text-success-500' : 'text-neutral-200'} aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function MockupAnalysis() {
  return (
    <div className="rounded-lg border border-neutral-100 bg-white shadow-sm w-full max-w-[520px] overflow-hidden" role="img" aria-label="AI image analysis demo">
      {/* Image */}
      <img
        src="/sample-landscape.jpg"
        alt="Mountain landscape at sunset"
        className="h-44 w-full object-cover"
        loading="lazy"
      />
      {/* Analysis output */}
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-primary-400" />
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider font-display">
            AI Analysis
          </span>
        </div>
        <p className="text-sm text-neutral-600 leading-relaxed">
          This photograph captures a mountain landscape at golden hour.
          Snow-capped peaks rise above a sea of clouds, illuminated by
          warm amber light. The foreground shows dark rocky terrain
          creating strong contrast with the soft cloud layer below.
        </p>
        <div className="mt-3 flex gap-2">
          <span className="rounded bg-neutral-50 px-2 py-0.5 text-xs text-neutral-400">landscape</span>
          <span className="rounded bg-neutral-50 px-2 py-0.5 text-xs text-neutral-400">mountains</span>
          <span className="rounded bg-neutral-50 px-2 py-0.5 text-xs text-neutral-400">golden hour</span>
          <span className="rounded bg-neutral-50 px-2 py-0.5 text-xs text-neutral-400">clouds</span>
        </div>
      </div>
    </div>
  );
}

function MockupChat() {
  return (
    <div className="rounded-lg border border-neutral-100 bg-white shadow-sm w-full max-w-[520px] overflow-hidden" role="img" aria-label="Chat conversation demo">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-25 px-4 py-2.5">
        <img src="/sample-landscape.jpg" alt="" aria-hidden="true" className="h-6 w-6 rounded object-cover" loading="lazy" />
        <span className="text-xs font-medium text-neutral-400">sunset-mountains.jpg</span>
      </div>
      {/* Messages */}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex justify-end">
          <div className="rounded bg-primary-500 px-3 py-2 text-sm text-white max-w-[70%]">
            What objects are in the foreground?
          </div>
        </div>
        <div className="flex justify-start">
          <div className="rounded bg-neutral-50 px-3 py-2 text-sm text-neutral-600 max-w-[80%] leading-relaxed">
            The foreground features a cluster of evergreen pine trees along the riverbank, with several large granite boulders partially submerged in the water.
          </div>
        </div>
        <div className="flex justify-end">
          <div className="rounded bg-primary-500 px-3 py-2 text-sm text-white max-w-[70%]">
            Is there any text visible?
          </div>
        </div>
        <div className="flex justify-start">
          <div className="rounded bg-neutral-50 px-3 py-2 text-sm text-neutral-600 max-w-[80%] leading-relaxed">
            No text is visible in this image. It&apos;s a natural landscape with no signs, labels, or watermarks.
          </div>
        </div>
      </div>
      {/* Input */}
      <div className="border-t border-neutral-100 px-4 py-3 flex items-center gap-2">
        <div className="flex-1 h-9 rounded border border-neutral-200 bg-neutral-25 px-3 flex items-center">
          <span className="text-xs text-neutral-400">Ask a follow-up question...</span>
        </div>
        <div className="h-9 w-9 rounded bg-primary-500 flex items-center justify-center">
          <ArrowRight className="h-4 w-4 text-white" />
        </div>
      </div>
    </div>
  );
}

function MockupStreaming() {
  return (
    <div className="rounded-lg border border-neutral-100 bg-white shadow-sm w-full max-w-[520px] overflow-hidden" role="img" aria-label="Real-time streaming demo">
      <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-25 px-4 py-2.5">
        <div className="h-6 w-6 rounded bg-neutral-100 flex items-center justify-center flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-neutral-400" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="8" y="14" width="7" height="7" rx="1" />
            <line x1="6.5" y1="10" x2="6.5" y2="14" />
            <line x1="17.5" y1="10" x2="17.5" y2="14" />
          </svg>
        </div>
        <span className="text-xs font-medium text-neutral-400">architecture-diagram.png</span>
        <div className="flex-1" />
        <span className="text-[10px] text-neutral-400 font-mono">streaming</span>
      </div>
      <div className="flex flex-col gap-3 p-4 h-[220px]">
        <div className="flex justify-end">
          <div className="rounded bg-primary-500 px-3 py-2 text-sm text-white max-w-[70%]">
            Describe the architecture shown here
          </div>
        </div>
        <div className="flex justify-start">
          <div className="rounded bg-neutral-50 px-3 py-2 text-sm text-neutral-600 max-w-[80%] leading-relaxed">
            This diagram shows a modular monolith with six domain modules.
            The upload module handles file ingestion with magic-byte
            validation, the AI module provides<span className="inline-block w-0.5 h-3.5 bg-primary-500 ml-0.5 align-middle animate-pulse" />
          </div>
        </div>
      </div>
      {/* SSE indicator bar */}
      <div className="border-t border-neutral-100 px-4 py-2 flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-success-500 animate-pulse" />
        <span className="text-[10px] text-neutral-400 font-mono">
          Server-Sent Events &middot; text/event-stream
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Feature section (Inkit pattern: text + mockup, alternating sides)  */
/* ------------------------------------------------------------------ */
function FeatureSection({
  title,
  description,
  linkText,
  mockup,
  reverse = false,
}: {
  title: string;
  description: string;
  linkText: string;
  mockup: React.ReactNode;
  reverse?: boolean;
}) {
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        'mx-auto flex max-w-6xl flex-col gap-10 px-5 sm:px-8 lg:flex-row lg:items-center lg:gap-20',
        reverse && 'lg:flex-row-reverse',
      )}
    >
      <Reveal className="lg:w-[55%] lg:flex-none min-w-0" delay={0}>
        <h3 className="font-display text-2xl font-bold text-neutral-800 sm:text-3xl leading-tight">
          {title}
        </h3>
        <p className="mt-4 text-neutral-400 leading-relaxed max-w-md text-lg">
          {description}
        </p>
        <button
          onClick={() => navigate('/app')}
          className="mt-6 inline-flex items-center gap-1 text-primary-500 font-semibold hover:text-primary-600 transition-colors group min-h-[44px] rounded focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)]"
        >
          {linkText}
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </Reveal>
      <Reveal className="lg:w-[45%] lg:flex-none min-w-0 flex justify-center" delay={150}>
        {mockup}
      </Reveal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Landing Page                                                  */
/* ------------------------------------------------------------------ */
export function LandingPage() {
  const navigate = useNavigate();
  const [navSolid, setNavSolid] = useState(false);

  useEffect(() => {
    function onScroll() {
      setNavSolid(window.scrollY > 40);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const goToApp = useCallback(() => {
    navigate('/app');
  }, [navigate]);

  const scrollToFeatures = useCallback(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById('features')
      ?.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth' });
  }, []);

  return (
    <div className="min-h-screen bg-white font-body text-neutral-600">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:rounded focus:bg-primary-500 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to main content
      </a>
      {/* ============================================================ */}
      {/*  NAV — matches Inkit: logo left, CTA right, clean border     */}
      {/* ============================================================ */}
      <nav
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-200',
          navSolid
            ? 'bg-white border-b border-neutral-100'
            : 'bg-transparent',
        )}
        aria-label="Landing page navigation"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <InksightLogo className="h-9 w-9" />
            <span className="text-xl font-bold tracking-tight text-neutral-800 font-display">
              INKSIGHT
            </span>
          </div>
          <div className="flex items-center gap-5">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-sm text-neutral-400">
              by <InkitLogo className="h-4 w-auto text-neutral-800" />
            </span>
            <button
              onClick={goToApp}
              className={cn(CTA_PRIMARY, 'px-4 py-2')}
            >
              Open app
            </button>
          </div>
        </div>
      </nav>

      <main id="main-content">
        {/* ============================================================ */}
        {/*  HERO — Inkit style: centered text, floating decorations     */}
        {/* ============================================================ */}
      <section className="relative overflow-hidden pt-32 pb-24 sm:pt-40 sm:pb-32" style={{ background: 'var(--gradient-hero)' }} aria-label="Hero">
        {/* Subtle grid background like Inkit */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--color-neutral-800) 1px, transparent 1px), linear-gradient(to bottom, var(--color-neutral-800) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
          aria-hidden="true"
        />

        {/* Floating viewfinder brackets — like Inkit's floating icon cubes */}
        <FloatingHexagon
          className="hidden lg:block"
          style={{ top: '12%', left: '8%', transform: 'rotate(-15deg)' }}
          size={56}
        />
        <FloatingHexagon
          className="hidden lg:block"
          style={{ top: '18%', right: '10%', transform: 'rotate(12deg)' }}
          size={44}
        />
        <FloatingHexagon
          className="hidden lg:block"
          style={{ bottom: '20%', left: '12%', transform: 'rotate(8deg)' }}
          size={36}
        />
        <FloatingHexagon
          className="hidden lg:block"
          style={{ bottom: '15%', right: '7%', transform: 'rotate(-20deg)' }}
          size={52}
        />
        <FloatingHexagon
          className="hidden lg:block"
          style={{ top: '50%', left: '3%', transform: 'rotate(25deg)' }}
          size={28}
        />

        <div className="relative z-10 mx-auto max-w-3xl px-5 text-center sm:px-8">
          <h1
            className="font-display text-5xl font-bold leading-[1.1] text-neutral-800 sm:text-6xl lg:text-7xl animate-[fadeInUp_600ms_cubic-bezier(0.22,1,0.36,1)_both]"
          >
            Visual intelligence
            <br />
            that handles it all
          </h1>
          <p
            className="mx-auto mt-6 max-w-xl text-lg text-neutral-400 leading-relaxed sm:text-xl animate-[fadeInUp_600ms_cubic-bezier(0.22,1,0.36,1)_100ms_both]"
          >
            Inksight is your single system for uploading, analyzing, and
            understanding images so you can focus on the work that
            actually matters.
          </p>
          <div
            className="mt-8 flex flex-wrap items-center justify-center gap-3 animate-[fadeInUp_600ms_cubic-bezier(0.22,1,0.36,1)_200ms_both]"
          >
            <button
              onClick={goToApp}
              className={cn(CTA_PRIMARY, 'px-6 py-2.5')}
            >
              Try it now
            </button>
            <button
              onClick={scrollToFeatures}
              className={cn(CTA_SECONDARY, 'px-6 py-2.5')}
            >
              Explore features
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FEATURES HEADER — Inkit pattern                              */}
      {/* ============================================================ */}
      <section id="features" className="border-t border-neutral-100 bg-white" aria-label="Features">
        <div className="mx-auto max-w-6xl px-5 pt-24 pb-4 sm:px-8 sm:pt-32">
          <Reveal>
            <h2 className="font-display text-3xl font-bold text-neutral-800 sm:text-4xl lg:text-5xl leading-tight">
              Everything you need, all in one place
            </h2>
          </Reveal>
        </div>

        {/* Feature 1 */}
        <div className="py-16 sm:py-24">
          <FeatureSection
            title="Upload any image instantly"
            description="Drag and drop or browse your files. PNG, JPG, and GIF supported with full validation, magic-byte verification, and secure storage. No downloads, no delays."
            linkText="Try uploading now"
            mockup={<MockupUpload />}
          />
        </div>

        {/* Feature 2 */}
        <div className="py-16 sm:py-24 bg-neutral-25">
          <FeatureSection
            title="AI that sees the details"
            description="Every upload is automatically analyzed. Objects, text, scenes, composition: the AI identifies what matters and delivers insights before you even ask."
            linkText="See it in action"
            mockup={<MockupAnalysis />}
            reverse
          />
        </div>

        {/* Feature 3 */}
        <div className="py-16 sm:py-24">
          <FeatureSection
            title="Have a real conversation"
            description="Ask follow-up questions in natural language. The AI remembers your full conversation history for each image, so context is never lost."
            linkText="Start a conversation"
            mockup={<MockupChat />}
          />
        </div>

        {/* Feature 4 */}
        <div className="py-16 sm:py-24 bg-neutral-25">
          <FeatureSection
            title="Watch AI think in real-time"
            description="Responses stream word-by-word over Server-Sent Events. No waiting for a full response. See the analysis build as the AI processes your image."
            linkText="Experience streaming"
            mockup={<MockupStreaming />}
            reverse
          />
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FOOTER CTA                                                   */}
      {/* ============================================================ */}
      <section className="py-24 sm:py-32 px-5 sm:px-8" aria-label="Call to action">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold text-neutral-800 sm:text-5xl leading-tight">
            Ready to see what
            <br />
            your images contain?
          </h2>
          <p className="mt-5 text-lg text-neutral-400 max-w-md mx-auto">
            Upload your first image and start a conversation.
            No account needed.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={goToApp}
              className={cn(CTA_PRIMARY, 'px-6 py-2.5')}
            >
              Upload your first image
            </button>
          </div>
        </Reveal>
      </section>
      </main>

      {/* ============================================================ */}
      {/*  FOOTER — Inkit style                                         */}
      {/* ============================================================ */}
      <footer className="border-t border-neutral-100 bg-white px-5 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <InksightLogo className="h-6 w-6 text-neutral-800" />
            <span className="text-sm font-bold tracking-tight text-neutral-800 font-display">
              INKSIGHT
            </span>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-neutral-400">
            <span>Built with NestJS, React &amp; TypeORM</span>
            <span className="hidden sm:inline">&middot;</span>
            <span>PostgreSQL &middot; SSE Streaming</span>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-neutral-400">
            by <InkitLogo className="h-3 w-auto text-neutral-400" />
          </span>
        </div>
      </footer>
    </div>
  );
}
