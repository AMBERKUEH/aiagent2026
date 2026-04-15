import AppLayout from "@/components/AppLayout";

const confidenceScore = 92;
const confidenceCircumference = 2 * Math.PI * 80;
const confidenceOffset = confidenceCircumference * (1 - confidenceScore / 100);

const modelStats = [
  { label: "Model", value: "YOLOv8-Custom-Paddy" },
  { label: "Inference", value: "42ms" },
];

const recommendationDetails = [
  "Inspect the surrounding 5 to 10 plants for oval lesions with pale centers and darker brown edges.",
  "Isolate severely affected leaves during the next field round to slow spore spread across the canopy.",
  "Maintain balanced nitrogen application and avoid overfertilizing, which can accelerate blight pressure.",
  "Recheck the same zone within 7 to 14 days and confirm whether lesion growth has slowed after treatment.",
];

const ScannerPage = () => {
  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[2rem] bg-surface-container-lowest p-5 shadow-[0_8px_32px_rgba(25,28,29,0.04)] sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#4edea3]" />
              <div>
                <p className="font-headline text-lg font-semibold tracking-[0.02em] text-primary">
                  Neural Engine Processing...
                </p>
                <p className="text-sm text-on-surface-variant">
                  Live detection is analyzing lesion edges, color variation, and spread pattern.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6 sm:gap-10">
              {modelStats.map((stat) => (
                <div key={stat.label} className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-outline/80">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-sm font-medium text-on-surface">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.8fr)] lg:items-start">
          <section className="space-y-6">
            <div className="relative overflow-hidden rounded-[2rem] bg-primary shadow-[0_18px_50px_rgba(25,28,29,0.12)]">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBJkXP6PRE1QCNmxXbp5jImK4HzTDG0Y7eLcM2-D1aDMHt781axVdyl5EjCfwzl6c6HwYhEV9NtOHTjlYkAbFjtl37jMnxqoJx0NfyiVexOjwJQYnpuk0OpI4hNGws_JQSP6e92l4o6cwgwdNooBDNhT18mP_4cyfkkLRfqXTU8jSFQRay-e7hXy8xoSuP5lBCaHd9n1vGX032ZYe4BEzWxeiB9o9MQnHEzhL269nQ5UFPlsYGFezzhHVh3yTfVKCT2CfpcolL4bmPn"
                alt="Paddy leaf scanner"
                className="h-[340px] w-full object-cover opacity-85 sm:h-[420px]"
              />

              <div className="absolute inset-0 p-4 sm:p-6">
                <div className="relative h-full rounded-[1.6rem] border border-white/10 bg-gradient-to-b from-black/5 via-transparent to-black/20">
                  <div className="absolute left-4 top-4 h-10 w-10 border-l-2 border-t-2 border-white/90 sm:left-6 sm:top-6 sm:h-12 sm:w-12" />
                  <div className="absolute right-4 top-4 h-10 w-10 border-r-2 border-t-2 border-white/90 sm:right-6 sm:top-6 sm:h-12 sm:w-12" />
                  <div className="absolute bottom-4 left-4 h-10 w-10 border-b-2 border-l-2 border-white/90 sm:bottom-6 sm:left-6 sm:h-12 sm:w-12" />
                  <div className="absolute bottom-4 right-4 h-10 w-10 border-b-2 border-r-2 border-white/90 sm:bottom-6 sm:right-6 sm:h-12 sm:w-12" />

                  <div className="absolute left-[40%] top-[30%] h-28 w-28 rounded-2xl border-2 border-[#4edea3] shadow-[0_0_0_1px_rgba(78,222,163,0.12)] sm:h-36 sm:w-36">
                    <div className="absolute -top-10 left-0 rounded-2xl bg-[#4edea3] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary shadow-[0_6px_16px_rgba(78,222,163,0.3)]">
                      Leaf Blight Detected
                    </div>
                  </div>

                  <div className="scanner-sweep absolute left-0 right-0 h-[2px]" />

                  <div className="absolute bottom-5 left-1/2 flex w-[calc(100%-2rem)] -translate-x-1/2 gap-3 sm:bottom-6 sm:w-auto">
                    <button className="glass-panel flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold text-primary shadow-[0_10px_26px_rgba(25,28,29,0.08)] transition-transform hover:scale-[1.01] active:scale-95 sm:min-w-[168px]">
                      <span className="material-symbols-outlined">photo_library</span>
                      <span>Upload Photo</span>
                    </button>
                    <button className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-primary shadow-[0_10px_26px_rgba(25,28,29,0.1)] transition-transform hover:scale-[1.01] active:scale-95 sm:min-w-[168px]">
                      <span className="material-symbols-outlined">photo_camera</span>
                      <span>Open Camera</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-[2.25rem] bg-surface-container-lowest p-8 text-center shadow-[0_8px_32px_rgba(25,28,29,0.04)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-outline/80">
                Confidence Score
              </p>
              <div className="relative mx-auto mt-8 flex h-52 w-52 items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 176 176" aria-hidden="true">
                  <circle
                    cx="88"
                    cy="88"
                    r="80"
                    fill="none"
                    stroke="hsl(var(--surface-container-low))"
                    strokeWidth="6"
                  />
                  <circle
                    cx="88"
                    cy="88"
                    r="80"
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={confidenceCircumference}
                    strokeDashoffset={confidenceOffset}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-headline text-6xl font-light text-primary">
                    {confidenceScore}
                    <span className="text-3xl text-outline/70">%</span>
                  </span>
                </div>
              </div>
              <p className="mt-8 text-xs font-semibold uppercase tracking-[0.22em] text-outline/70">
                Precision Serenity Engine
              </p>
            </div>
          </section>
        </div>

        <section className="rounded-[2.25rem] bg-primary p-8 text-primary-foreground shadow-[0_16px_40px_rgba(0,53,39,0.16)] sm:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xl">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                  <span className="material-symbols-outlined text-2xl text-[#4edea3]">coronavirus</span>
                </div>
                <h2 className="font-headline text-xl font-bold tracking-[0.02em]">Detection Result</h2>
              </div>

              <div className="space-y-3">
                <p className="text-2xl font-semibold leading-tight sm:text-3xl">Early leaf blight detected</p>
                <p className="flex items-center gap-2 text-sm text-white/65">
                  <span className="material-symbols-outlined text-base">warning</span>
                  Impact: High risk of 20-30% yield loss
                </p>
                <p className="max-w-lg text-sm leading-7 text-white/80">
                  The lesion pattern suggests an early-stage infection concentrated around the scanned blade.
                  Fast containment and follow-up scouting will reduce the chance of spread into adjacent rows.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[360px]">
              <div className="rounded-2xl bg-white/8 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">Severity</p>
                <p className="mt-2 text-lg font-semibold text-white">Moderate</p>
              </div>
              <div className="rounded-2xl bg-white/8 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">Spread Risk</p>
                <p className="mt-2 text-lg font-semibold text-white">Localized</p>
              </div>
              <div className="rounded-2xl bg-white/8 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">Priority</p>
                <p className="mt-2 text-lg font-semibold text-white">Treat This Week</p>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 border-t border-white/10 pt-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">
                Recommended Action
              </p>
              <p className="mt-3 text-sm leading-7 text-white/80">
                Apply a systemic fungicide containing Hexaconazole 5% SC according to label guidance,
                improve canopy airflow where possible, and avoid leaving infected debris in standing
                water. Repeat field review after 14 days if symptoms persist or expand.
              </p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">
                Field Checklist
              </p>
              <div className="mt-4 space-y-3">
                {recommendationDetails.map((item) => (
                  <div key={item} className="flex gap-3 rounded-2xl bg-white/8 px-4 py-3">
                    <span className="material-symbols-outlined mt-0.5 text-[#4edea3]">check_circle</span>
                    <p className="text-sm leading-6 text-white/80">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  );
};

export default ScannerPage;
