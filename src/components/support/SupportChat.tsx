"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/ui/Logo";
import { buildSupportChatApiMessages } from "@/lib/support/buildSupportChatApiMessages";
import { formatClientSupportContext } from "@/lib/support/clientSupportContext";
import {
  buildTripHelpContextFromLiveStorage,
  tryAnswerTripQuestion,
} from "@/lib/support/tripHelpAnswer";
import { BugReportModal } from "@/components/support/BugReportModal";
import {
  AIRPORT_CONFIRM_SPOT_EVENT,
  AIRPORT_WALK_SHEET_EVENT,
} from "@/lib/airportNav/airportWalkSheet";

const SUPPORT_OPEN_EVENT = "kepi:support-chat-open";
/** Tab bar uses z-[99999]; panel must sit above it so the composer stays tappable on mobile. */
export const SUPPORT_CHAT_PANEL_Z_CLASS = "z-[100010]";
export const SUPPORT_CHAT_STATE_EVENT = "kepi:support-chat-state";
const PLAN_CITY_OPEN_EVENT = "kepi:plan-city-open";
const SUPPORT_QUICK_PROMPTS = [
  "Where am I?",
  "What's my next travel day?",
  "What time is my train?",
  "Find a good walking tour",
  "Where's a great restaurant nearby?",
  "Plan a city day",
  "What are my EU passenger rights (EC 261)?",
] as const;
const BUG_REPORT_OPEN_EVENT = "kepi:bug-report-open";

// ... truncated for test