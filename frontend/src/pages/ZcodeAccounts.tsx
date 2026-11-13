import type { ReactNode } from "react";
import ClaudeAccounts from "./ClaudeAccounts";

export default function ZcodeAccounts({ headerSlot }: { headerSlot?: ReactNode }) {
  return <div className="animate-channel-switch-in"><ClaudeAccounts provider="zcode" headerSlot={headerSlot} /></div>;
}
