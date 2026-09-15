import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, suiLight } from "@ringcentral/spring-theme";
import { RingCxToastProvider } from "@proto";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/queryClient";
import { SupervisorAgents } from "@/pages/SupervisorAgents";

/**
 * Legacy-only providers live behind this lazy route boundary. In particular,
 * importing @proto here is intentionally deferred so /analytics never
 * initializes Supervisor tables, takeover stores, or Juno consumers.
 */
export default function SupervisorRoute() {
  return (
    <ThemeProvider theme={suiLight} scope="supervisor-native" className="contents">
      <RingCxToastProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <SupervisorAgents />
          </TooltipProvider>
        </QueryClientProvider>
      </RingCxToastProvider>
    </ThemeProvider>
  );
}