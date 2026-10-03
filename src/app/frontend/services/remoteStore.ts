import { QueryCache, QueryClient } from "@tanstack/react-query";
import { queryClientDefaults } from "../../../../settings/networking";
import { reportError } from "./errors";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: queryClientDefaults,
    queryCache: new QueryCache({
      onError: (error, query) => {
        reportError(error, { queryKey: query.queryKey });
      },
    }),
  });
}
