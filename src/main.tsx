import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";

createRoot(document.getElementById("root")!).render(
	<LanguageProvider>
		<App />
	</LanguageProvider>
);
