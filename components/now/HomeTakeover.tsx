"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "../../lib/contract";
import { useNow } from "../../lib/client/clock";
import {
  getLocalStateServerSnapshot,
  getLocalStateSnapshot,
  subscribeLocalState,
} from "../../lib/client/local-state";
import { withNowParam } from "../../lib/client/now";
import { fetchSessionsByIds } from "../../lib/client/sessions-api";
import { findTakeoverSession, hasNowOptOut } from "./now-helpers";

export default function HomeTakeover() {
  // Outside an app-router tree (plain component tests) useRouter throws;
  // fall back to a same-tab location replace there.
  let router: ReturnType<typeof useRouter> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    router = useRouter();
  } catch {
    router = null;
  }
  const now = useNow();
  const localState = useSyncExternalStore(
    subscribeLocalState,
    getLocalStateSnapshot,
    getLocalStateServerSnapshot,
  );
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadedKey, setLoadedKey] = useState("");
  const redirected = useRef(false);

  const planIds = localState.plan.sessionIds;
  const planKey = planIds.join(",");

  // Only public session IDs are looked up, once per change to the plan's IDs;
  // the per-second clock tick never refetches.
  useEffect(() => {
    if (planIds.length === 0) return undefined;
    const controller = new AbortController();
    fetchSessionsByIds(planIds, controller.signal)
      .then((found) => {
        setSessions(found);
        setLoadedKey(planKey);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadedKey(planKey);
      });
    return () => controller.abort();
    // planKey stands in for planIds so the effect re-runs only when ids change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  useEffect(() => {
    if (redirected.current) return;
    if (planKey !== "" && loadedKey !== planKey) return;
    if (now.getTime() === 0 || hasNowOptOut()) return;
    const current = findTakeoverSession(sessions, localState.plan, now);
    if (!current) return;
    redirected.current = true;
    const raw = new URLSearchParams(window.location.search).get("now") ?? undefined;
    const destination = withNowParam("/now", raw);
    if (router) router.replace(destination);
    else window.location.replace(destination);
  }, [loadedKey, localState.plan, now, planKey, router, sessions]);

  return null;
}
