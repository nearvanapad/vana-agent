import { Bowlby_One, JetBrains_Mono, Rubik } from "next/font/google";

/** Headings and the wordmark. */
export const bowlby = Bowlby_One({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-bowlby" });

/** Body copy. */
export const rubik = Rubik({ subsets: ["latin"], display: "swap", variable: "--font-rubik" });

/** Numbers, tickers, percentages and account names. */
export const jetbrains = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-jetbrains" });
