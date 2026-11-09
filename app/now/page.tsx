import type { Metadata } from "next";
import NowScreen from "../../components/NowScreen";

export const metadata: Metadata = {
  title: "Now | FocusTrack",
};

type NowPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NowPage({ searchParams }: NowPageProps) {
  const params = await searchParams;
  const raw = params.now;
  return <NowScreen nowParam={typeof raw === "string" ? raw : undefined} />;
}
