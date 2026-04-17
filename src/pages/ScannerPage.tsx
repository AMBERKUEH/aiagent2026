import AppLayout from "@/components/AppLayout";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type ScanResult = {
  diseaseName: string;
  confidence: number;
  summary: string;
  severity: string;
  spreadRisk: string;
  priority: string;
  impact: string;
  recommendation: string;
  checklist: string[];
  modelName: string;
  inferenceTime: string;
};

const defaultScannerImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBJkXP6PRE1QCNmxXbp5jImK4HzTDG0Y7eLcM2-D1aDMHt781axVdyl5EjCfwzl6c6HwYhEV9NtOHTjlYkAbFjtl37jMnxqoJx0NfyiVexOjwJQYnpuk0OpI4hNGws_JQSP6e92l4o6cwgwdNooBDNhT18mP_4cyfkkLRfqXTU8jSFQRay-e7hXy8xoSuP5lBCaHd9n1vGX032ZYe4BEzWxeiB9o9MQnHEzhL269nQ5UFPlsYGFezzhHVh3yTfVKCT2CfpcolL4bmPn";

const defaultChecklist = [
  "Inspect the surrounding 5 to 10 plants for similar lesions before symptoms spread further.",
  "Tag the affected zone and revisit it within the next 7 to 14 days to confirm whether the damage is expanding.",
  "Avoid overfertilizing with nitrogen until the disease pressure has been reassessed in the field.",
  "Remove badly affected leaf material during the next scouting round if local agronomy guidance recommends it.",
];

const labelChecklistMap: Record<string, string[]> = {
  healthy: [
    "Continue monitoring the same plot during the next scouting round to confirm the leaves stay symptom-free.",
    "Keep irrigation and nutrient management stable because the current image does not suggest disease stress.",
    "Capture another leaf image if new discoloration or lesion patterns appear in nearby plants.",
  ],
  bacterial_blight: [
    "Check adjacent plants for yellowing and water-soaked leaf margins, especially after recent rain or wind damage.",
    "Avoid excess nitrogen application until the field condition is reassessed.",
    "Separate heavily affected areas in your field notes so treatment can be targeted quickly.",
  ],
  blast: [
    "Inspect nearby leaves for spindle-shaped lesions with gray centers and darker edges.",
    "Reduce prolonged leaf wetness where possible by reviewing irrigation timing and canopy density.",
    "Plan a follow-up field visit within one week to confirm whether the lesions are spreading.",
  ],
  brown_spot: [
    "Inspect the field for additional brown circular spots, especially on older leaves and nutrient-stressed plants.",
    "Review potassium and overall nutrient balance because deficiencies can worsen brown spot pressure.",
    "Track whether the lesion count increases over the next 7 to 10 days.",
  ],
  hispa: [
    "Check for scraping damage or windowing on neighboring leaves because insect pressure can spread quickly.",
    "Inspect the underside of leaves for insects or eggs before deciding on control action.",
    "Record the affected area and revisit it soon to confirm whether feeding damage is increasing.",
  ],
  tungro: [
    "Inspect nearby plants for stunting and yellow-orange discoloration that can indicate wider tungro spread.",
    "Review vector pressure in the field and watch for leafhopper activity during the next scouting pass.",
    "Mark the affected zone so you can compare symptom progression over the coming week.",
  ],
  unknown: defaultChecklist,
};

const emptyResult: ScanResult = {
  diseaseName: "Awaiting scan",
  confidence: 0,
  summary: "Upload a paddy leaf photo or capture one with the camera to send it to the backend for analysis.",
  severity: "Pending",
  spreadRisk: "Unknown",
  priority: "Ready When You Are",
  impact: "No analysis has been run yet",
  recommendation: "Once an image is submitted, SmartPaddy will display the detected class, confidence score, and the backend recommendation here.",
  checklist: defaultChecklist,
  modelName: "Backend detector",
  inferenceTime: "--",
};

const toTitleCase = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const formatConfidence = (value: number) => {
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(normalized)));
};

const asString = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

const asStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
};

const pickString = (source: Record<string, unknown>, keys: string[], fallback: string) => {
  for (const key of keys) {
    const value = asString(source[key]);
    if (value) return value;
  }

  return fallback;
};

const pickNumber = (source: Record<string, unknown>, keys: string[], fallback: number) => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return fallback;
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to encode the selected image."));
    };
    reader.onerror = () => reject(new Error("Unable to read the selected image."));
    reader.readAsDataURL(file);
  });

const buildFallbackSummary = (
  fileName: string,
  rawDiseaseName: string,
  confidence: number,
  alternatives: Array<Record<string, unknown>>
) => {
  const secondary = alternatives
    .slice(1, 3)
    .map((item) => asString(item.label))
    .filter((value): value is string => Boolean(value))
    .map(toTitleCase);
  const confidenceText = confidence > 0 ? ` at ${confidence}% confidence` : "";
  const alternativesText = secondary.length > 0 ? ` Other likely classes: ${secondary.join(", ")}.` : "";

  return `The backend analyzed ${fileName} and returned ${toTitleCase(rawDiseaseName)}${confidenceText}.${alternativesText}`;
};

const normalizeScanResponse = (payload: unknown, fileName: string): ScanResult => {
  if (!payload || typeof payload !== "object") {
    return {
      ...emptyResult,
      diseaseName: "Unexpected response",
      summary: `The backend returned a response for ${fileName}, but it was not in a supported JSON format.`,
      priority: "Check Backend Contract",
    };
  }

  const source = payload as Record<string, unknown>;
  const primaryDetection = Array.isArray(source.detections) && source.detections[0] && typeof source.detections[0] === "object"
    ? (source.detections[0] as Record<string, unknown>)
    : null;
  const details = source.result && typeof source.result === "object"
    ? (source.result as Record<string, unknown>)
    : null;
  const contract = source.contract && typeof source.contract === "object"
    ? (source.contract as Record<string, unknown>)
    : null;
  const topPredictions = Array.isArray(source.top_predictions)
    ? source.top_predictions.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : [];
  const merged = {
    ...(contract ?? {}),
    ...(primaryDetection ?? {}),
    ...(details ?? {}),
    ...source,
  } satisfies Record<string, unknown>;

  const rawDiseaseName = pickString(
    merged,
    ["disease_name", "disease", "label", "class_name", "class", "prediction", "predicted_class", "predicted_label", "name", "fallback_label"],
    "unknown"
  );
  const normalizedKey = rawDiseaseName.toLowerCase().replace(/[\s-]+/g, "_");
  const confidence = formatConfidence(pickNumber(merged, ["confidence", "score", "probability"], 0));
  const checklist = asStringArray(merged.checklist).length > 0
    ? asStringArray(merged.checklist)
    : asStringArray(merged.recommendations).length > 0
      ? asStringArray(merged.recommendations)
      : labelChecklistMap[normalizedKey] ?? defaultChecklist;

  return {
    diseaseName: toTitleCase(rawDiseaseName),
    confidence,
    summary: pickString(
      merged,
      ["summary", "description", "analysis", "message", "details"],
      buildFallbackSummary(fileName, rawDiseaseName, confidence, topPredictions)
    ),
    severity: toTitleCase(pickString(merged, ["severity", "risk_level"], confidence >= 80 ? "High" : confidence >= 55 ? "Moderate" : "Low")),
    spreadRisk: toTitleCase(pickString(merged, ["spread_risk", "spreadRisk"], confidence >= 80 ? "Elevated" : confidence >= 55 ? "Watchlist" : "Monitor")),
    priority: toTitleCase(pickString(merged, ["priority", "urgency"], confidence >= 80 ? "Inspect Immediately" : "Field Review This Week")),
    impact: pickString(
      merged,
      ["impact", "impact_summary"],
      normalizedKey === "healthy" ? "No visible disease signal detected in this image" : "Visual disease signal detected and needs field confirmation"
    ),
    recommendation: pickString(
      merged,
      ["recommendation", "recommended_action", "action", "advice"],
      normalizedKey === "healthy"
        ? "No urgent treatment is suggested from this scan. Keep monitoring nearby leaves and capture another image if symptoms appear."
        : "Review the surrounding leaves, compare symptoms across nearby plants, and confirm the next treatment step with your agronomy playbook."
    ),
    checklist,
    modelName: pickString(merged, ["model", "model_name", "engine"], "Backend detector"),
    inferenceTime: pickString(merged, ["inference_time", "latency", "processing_time"], "--"),
  };
};

const endpointCandidates = ["/api/cv/predict", "/api/scan", "/api/predict-image", "/api/detect-disease"];

const ScannerPage = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<ScanResult>(emptyResult);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const releaseImageUrl = (imageUrl: string | null) => {
    if (imageUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(imageUrl);
    }
  };

  useEffect(() => {
    return () => {
      releaseImageUrl(uploadedImageUrl);
    };
  }, [uploadedImageUrl]);

  useEffect(() => {
    if (!videoRef.current || !cameraStream) return;

    videoRef.current.srcObject = cameraStream;
  }, [cameraStream]);

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraStream]);

  const resetAnalysis = () => {
    setAnalysisResult(emptyResult);
    setAnalysisError(null);
    setIsAnalyzing(false);
  };

  const analyzeImage = async (file: File) => {
    setIsAnalyzing(true);
    setAnalysisError(null);

    let lastError: Error | null = null;
    let base64Image: string | null = null;

    try {
      base64Image = await fileToDataUrl(file);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unable to prepare the image for analysis.");
    }

    for (const endpoint of endpointCandidates) {
      try {
        if (endpoint === "/api/cv/predict" && !base64Image) {
          continue;
        }

        const response = endpoint === "/api/cv/predict"
          ? await fetch(endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                image_base64: base64Image,
              }),
            })
          : await fetch(endpoint, {
              method: "POST",
              body: (() => {
                const formData = new FormData();
                formData.append("image", file);
                formData.append("file", file);
                formData.append("filename", file.name);
                return formData;
              })(),
            });

        if (!response.ok) {
          let detail = "";
          try {
            const errorData = await response.json();
            if (errorData && typeof errorData === "object") {
              const detailValue = (errorData as Record<string, unknown>).detail;
              if (typeof detailValue === "string" && detailValue.trim()) {
                detail = detailValue.trim();
              }
            }
          } catch {
            try {
              const errorText = await response.text();
              if (errorText.trim()) detail = errorText.trim();
            } catch {
              detail = "";
            }
          }

          if (response.status === 404) {
            lastError = new Error(`Endpoint ${endpoint} was not found.`);
            continue;
          }

          throw new Error(detail || `Scan request failed with status ${response.status}.`);
        }

        const payload = await response.json();
        setAnalysisResult(normalizeScanResponse(payload, file.name));
        setAnalysisError(null);
        setIsAnalyzing(false);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Scan request failed.");
      }
    }

    setIsAnalyzing(false);
    setAnalysisResult({
      ...emptyResult,
      diseaseName: "Scan unavailable",
      summary: `The selected image (${file.name}) could not be analyzed because the scanner backend endpoint did not respond with a supported result.`,
      priority: "Backend Needed",
    });
    setAnalysisError(lastError?.message ?? "Unable to analyze the selected image.");
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelection = async (file: File) => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setCameraError(null);
    releaseImageUrl(uploadedImageUrl);

    const nextImageUrl = URL.createObjectURL(file);
    setUploadedImageUrl(nextImageUrl);
    setUploadedFileName(file.name);
    setSelectedImageFile(file);
    await analyzeImage(file);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await handleFileSelection(file);
  };

  const handleRemoveUpload = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setCameraError(null);
    releaseImageUrl(uploadedImageUrl);

    setUploadedImageUrl(null);
    setUploadedFileName(null);
    setSelectedImageFile(null);
    resetAnalysis();

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleOpenCamera = async () => {
    if (cameraStream && videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;

      const context = canvas.getContext("2d");
      if (!context) {
        setCameraError("Unable to capture the current frame.");
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const capturedImage = canvas.toDataURL("image/jpeg", 0.92);
      const capturedBlob = await fetch(capturedImage).then((response) => response.blob());
      const capturedFile = new File([capturedBlob], `camera-capture-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });

      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
      setCameraError(null);
      releaseImageUrl(uploadedImageUrl);
      setUploadedImageUrl(capturedImage);
      setUploadedFileName(capturedFile.name);
      setSelectedImageFile(capturedFile);
      await analyzeImage(capturedFile);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser does not support camera access.");
      return;
    }

    try {
      releaseImageUrl(uploadedImageUrl);
      setUploadedImageUrl(null);
      setUploadedFileName(null);
      setSelectedImageFile(null);
      resetAnalysis();
      setCameraError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      setCameraStream(stream);
    } catch {
      setCameraError("Camera access was denied or is unavailable on this device.");
    }
  };

  const handleRetryAnalysis = async () => {
    if (!selectedImageFile) return;
    await analyzeImage(selectedImageFile);
  };

  const displayedScannerImage = uploadedImageUrl ?? defaultScannerImage;
  const isShowingUploadedImage = uploadedImageUrl !== null;
  const isCameraActive = cameraStream !== null;
  const confidenceCircumference = 2 * Math.PI * 80;
  const confidenceOffset = confidenceCircumference * (1 - analysisResult.confidence / 100);
  const isWaitingForImage = !selectedImageFile && !isCameraActive;

  const modelStats = useMemo(
    () => [
      { label: "Model", value: analysisResult.modelName },
      { label: "Inference", value: isAnalyzing ? "Running..." : analysisResult.inferenceTime },
    ],
    [analysisResult.inferenceTime, analysisResult.modelName, isAnalyzing]
  );

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[2rem] bg-surface-container-lowest p-5 shadow-[0_8px_32px_rgba(25,28,29,0.04)] sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className={`h-2.5 w-2.5 rounded-full ${isAnalyzing ? "animate-pulse bg-[#4edea3]" : "bg-primary/30"}`} />
              <div>
                <p className="font-headline text-lg font-semibold tracking-[0.02em] text-primary">
                  {isAnalyzing ? "Neural Engine Processing..." : "Scanner Ready"}
                </p>
                <p className="text-sm text-on-surface-variant">
                  {isAnalyzing
                    ? "Your image is being sent to the backend for disease classification and confidence scoring."
                    : "Upload or capture a paddy leaf image to run the backend disease scan."}
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              {isCameraActive ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-[340px] w-full object-cover sm:h-[420px]"
                />
              ) : (
                <img
                  src={displayedScannerImage}
                  alt="Paddy leaf scanner"
                  className={`h-[340px] w-full sm:h-[420px] ${
                    isShowingUploadedImage ? "object-contain bg-black/25 p-4 opacity-100" : "object-cover opacity-85"
                  }`}
                />
              )}

              <div className="absolute inset-0 p-4 sm:p-6">
                <div className="relative h-full rounded-[1.6rem] border border-white/10 bg-gradient-to-b from-black/5 via-transparent to-black/20">
                  <div className="absolute left-4 top-4 h-10 w-10 border-l-2 border-t-2 border-white/90 sm:left-6 sm:top-6 sm:h-12 sm:w-12" />
                  <div className="absolute right-4 top-4 h-10 w-10 border-r-2 border-t-2 border-white/90 sm:right-6 sm:top-6 sm:h-12 sm:w-12" />
                  <div className="absolute bottom-4 left-4 h-10 w-10 border-b-2 border-l-2 border-white/90 sm:bottom-6 sm:left-6 sm:h-12 sm:w-12" />
                  <div className="absolute bottom-4 right-4 h-10 w-10 border-b-2 border-r-2 border-white/90 sm:bottom-6 sm:right-6 sm:h-12 sm:w-12" />

                  {!isShowingUploadedImage && !isCameraActive && (
                    <div className="absolute left-[40%] top-[30%] h-28 w-28 rounded-2xl border-2 border-[#4edea3] shadow-[0_0_0_1px_rgba(78,222,163,0.12)] sm:h-36 sm:w-36">
                      <div className="absolute -top-10 left-0 rounded-2xl bg-[#4edea3] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary shadow-[0_6px_16px_rgba(78,222,163,0.3)]">
                        Ready To Scan
                      </div>
                    </div>
                  )}

                  <div className="scanner-sweep absolute left-0 right-0 h-[2px]" />

                  {(uploadedFileName || isCameraActive) && (
                    <button
                      type="button"
                      onClick={handleRemoveUpload}
                      className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white shadow-[0_8px_24px_rgba(25,28,29,0.18)] backdrop-blur-md transition-colors hover:bg-black/60 sm:right-6 sm:top-6"
                      aria-label={isCameraActive ? "Close camera" : "Remove uploaded photo"}
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  )}

                  {cameraError && (
                    <div className="absolute left-4 top-16 max-w-[calc(100%-2rem)] rounded-2xl bg-black/50 px-4 py-3 text-sm text-white shadow-[0_8px_24px_rgba(25,28,29,0.18)] backdrop-blur-md sm:left-6 sm:max-w-sm">
                      {cameraError}
                    </div>
                  )}

                  {uploadedFileName && !isCameraActive && (
                    <div className="absolute left-4 top-4 max-w-[calc(100%-5rem)] rounded-2xl bg-black/45 px-4 py-2 text-xs font-medium text-white shadow-[0_8px_24px_rgba(25,28,29,0.18)] backdrop-blur-md sm:left-6 sm:top-6">
                      {uploadedFileName}
                    </div>
                  )}

                  <div className="absolute bottom-5 left-1/2 flex w-[calc(100%-2rem)] -translate-x-1/2 gap-3 sm:bottom-6 sm:w-auto">
                    <button
                      type="button"
                      onClick={handleUploadClick}
                      className="glass-panel flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold text-primary shadow-[0_10px_26px_rgba(25,28,29,0.08)] transition-transform hover:scale-[1.01] active:scale-95 sm:min-w-[168px]"
                    >
                      <span className="material-symbols-outlined">photo_library</span>
                      <span>Upload Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenCamera}
                      className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-primary shadow-[0_10px_26px_rgba(25,28,29,0.1)] transition-transform hover:scale-[1.01] active:scale-95 sm:min-w-[168px]"
                    >
                      <span className="material-symbols-outlined">
                        {isCameraActive ? "radio_button_checked" : "photo_camera"}
                      </span>
                      <span>{isCameraActive ? "Take Picture" : "Open Camera"}</span>
                    </button>
                    {selectedImageFile && !isCameraActive && (
                      <button
                        type="button"
                        onClick={handleRetryAnalysis}
                        disabled={isAnalyzing}
                        className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#4edea3] px-5 text-sm font-semibold text-primary shadow-[0_10px_26px_rgba(25,28,29,0.1)] transition-transform hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 sm:min-w-[168px]"
                      >
                        <span className="material-symbols-outlined">neurology</span>
                        <span>{isAnalyzing ? "Analyzing" : "Analyze Again"}</span>
                      </button>
                    )}
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
                    {analysisResult.confidence}
                    <span className="text-3xl text-outline/70">%</span>
                  </span>
                </div>
              </div>
              <p className="mt-8 text-xs font-semibold uppercase tracking-[0.22em] text-outline/70">
                {isWaitingForImage ? "Ready for backend scan" : isAnalyzing ? "Backend inference in progress" : analysisResult.diseaseName}
              </p>
              {analysisError && <p className="mt-4 text-sm text-red-600">{analysisError}</p>}
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
                <p className="text-2xl font-semibold leading-tight sm:text-3xl">{analysisResult.diseaseName}</p>
                <p className="flex items-center gap-2 text-sm text-white/65">
                  <span className="material-symbols-outlined text-base">warning</span>
                  Impact: {analysisResult.impact}
                </p>
                <p className="max-w-lg text-sm leading-7 text-white/80">{analysisResult.summary}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[360px]">
              <div className="rounded-2xl bg-white/8 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">Severity</p>
                <p className="mt-2 text-lg font-semibold text-white">{analysisResult.severity}</p>
              </div>
              <div className="rounded-2xl bg-white/8 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">Spread Risk</p>
                <p className="mt-2 text-lg font-semibold text-white">{analysisResult.spreadRisk}</p>
              </div>
              <div className="rounded-2xl bg-white/8 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">Priority</p>
                <p className="mt-2 text-lg font-semibold text-white">{analysisResult.priority}</p>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 border-t border-white/10 pt-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">
                Recommended Action
              </p>
              <p className="mt-3 text-sm leading-7 text-white/80">{analysisResult.recommendation}</p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">
                Field Checklist
              </p>
              <div className="mt-4 space-y-3">
                {analysisResult.checklist.map((item) => (
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
