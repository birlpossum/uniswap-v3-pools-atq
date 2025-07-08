import fetch from "node-fetch";
import { ContractTag, ITagService } from "atq-types";

// Uniswap V3 Subgraph for Arbitrum One, using the decentralized gateway.
const SUBGRAPH_URL_TEMPLATE = "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/deployments/id/QmQc23tY3k3nJm2r52b1ER1p5zK2g2QDN4922n1s22i1d4";

interface PoolToken {
  id: string;
  name: string;
  symbol: string;
}

interface Pool {
  id: string;
  createdAtTimestamp: number;
  token0: PoolToken;
  token1: PoolToken;
}

interface GraphQLData {
  pools: Pool[];
}

interface GraphQLResponse {
  data?: GraphQLData;
  errors?: { message: string }[];
}

const headers: Record<string, string> = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

const GET_POOLS_QUERY = `
query GetPools($lastTimestamp: Int) {
  pools(
    first: 1000,
    orderBy: createdAtTimestamp,
    orderDirection: asc,
    where: { createdAtTimestamp_gt: $lastTimestamp }
  ) {
    id
    createdAtTimestamp
    token0 {
      id
      name
      symbol
    }
    token1 {
      id
      name
      symbol
    }
  }
}
`;

function isError(e: unknown): e is Error {
  return (
    typeof e === "object" &&
    e !== null &&
    "message" in e &&
    typeof (e as Error).message === "string"
  );
}

function containsHtmlOrMarkdown(text: string): boolean {
  // Simple HTML tag detection
  if (/<[^>]*>/.test(text)) {
    return true;
  }

  return false;
}

async function fetchData(subgraphUrl: string, lastTimestamp: number): Promise<Pool[]> {
  const response = await fetch(subgraphUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: GET_POOLS_QUERY,
      variables: { lastTimestamp },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const result = (await response.json()) as GraphQLResponse;
  if (result.errors) {
    result.errors.forEach((error) => {
      console.error(`GraphQL error: ${error.message}`);
    });
    throw new Error("GraphQL errors occurred: see logs for details.");
  }

  if (!result.data || !result.data.pools) {
    throw new Error("No pools data found.");
  }

  return result.data.pools;
}

function transformPoolsToTags(chainId: string, pools: Pool[]): ContractTag[] {
  return pools.map((pool) => {
    const symbolsText = `${pool.token0.symbol}/${pool.token1.symbol}`;

    return {
      "Contract Address": `eip155:${chainId}:${pool.id}`,
      "Public Name Tag": `${symbolsText} Pool`,
      "Project Name": "Uniswap v3",
      "UI/Website Link": `https://info.uniswap.org/#/arbitrum/pools/${pool.id}`,
      "Public Note": `A Uniswap v3 pool with the tokens: ${pool.token0.name} (symbol: ${pool.token0.symbol}) and ${pool.token1.name} (symbol: ${pool.token1.symbol}).`,
    };
  });
}

class TagService implements ITagService {
  returnTags = async (chainId: string, apiKey: string): Promise<ContractTag[]> => {
    if (chainId !== "42161") {
      throw new Error(`Unsupported Chain ID: ${chainId}.`);
    }

    const subgraphUrl = SUBGRAPH_URL_TEMPLATE.replace("[api-key]", apiKey);

    let lastTimestamp: number = 0;
    let allTags: ContractTag[] = [];
    let isMore = true;

    while (isMore) {
      try {
        const pools = await fetchData(subgraphUrl, lastTimestamp);
        allTags.push(...transformPoolsToTags(chainId, pools));

        isMore = pools.length === 1000;
        if (isMore) {
          lastTimestamp = parseInt(
            pools[pools.length - 1].createdAtTimestamp.toString(),
            10
          );
        }
      } catch (error) {
        if (isError(error)) {
          console.error(`An error occurred: ${error.message}`);
          throw new Error(`Failed fetching data: ${error.message}`);
        } else {
          console.error("An unknown error occurred.");
          throw new Error("An unknown error occurred during fetch operation.");
        }
      }
    }
    return allTags;
  };
}

const tagService = new TagService();

export const returnTags = tagService.returnTags;
