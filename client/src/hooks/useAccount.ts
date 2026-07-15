import { trpc } from "@/lib/trpc";

/**
 * VVServices custom account auth hook (buyer / jeweller / admin).
 * Backed by the `account.me` procedure and the vv_session cookie.
 */
export function useAccount() {
  const utils = trpc.useUtils();
  const { data: account, isLoading } = trpc.account.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.account.logout.useMutation({
    onSuccess: () => {
      utils.account.me.setData(undefined, null);
      utils.invalidate();
    },
  });

  return {
    account: account ?? null,
    loading: isLoading,
    isAuthenticated: !!account,
    logout: () => logoutMutation.mutate(),
  };
}
