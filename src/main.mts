import fetch from "node-fetch";
import { ContractTag, ITagService } from "atq-types";

const SUBGRAPH_URLS: Record<string, { decentralized: string }> = {
  // Arbitrum One
  "42161": {
    decentralized:
      "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/FQ6JYszEKApsBpAmiHesRsd9Ygc6mzmpNRANeVQFYoVX",
  },
  "137": {
    decentralized:
      "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/deployments/id/QmdAaDAUDCypVB85eFUkQMkS5DE1HV4s7WJb6iSiygNvAw", // Polygon deployment, same as the latest deployment ID as of 8-5-2024 on https://thegraph.com/hosted-service/subgraph/ianlapham/uniswap-v3-polygon, which is used on info.uniswap.org
  },
  "10": {
    decentralized:
      "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/deployments/id/QmbTaWMFk4baXnoKQodnyYsFVKFNEiLsgZAe6eu2Sdj8Ef",
  }, // Optimism deployment, same as the latest deployment ID as of 8-5-2024 on https://thegraph.com/hosted-service/subgraph/ianlapham/optimism-post-regenesis , which is used on info.uniswap.org
  "42220": {
    decentralized:
      "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/deployments/id/QmXfJmxY7C4A4UoWEexvei8XzcSxMegr78rt3Rzz8szkZA",
  }, // Celo deployment, same as the latest deployment ID as of 8-5-2024 on https://thegraph.com/hosted-service/subgraph/jesse-sawa/uniswap-celo, which is used on info.uniswap.org
};
=======
// Uniswap V3 Subgraph for Arbitrum One, using the decentralized gateway.
const SUBGRAPH_URL_TEMPLATE = `https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/FQ6JYszEKApsBpAmiHesRsd9Ygc6mzmpNRANeVQFYoVX`;
>>>>>>> 6589e7b02c9572a7662525e7ee1afc50f98ede3c

interface PoolToken {
  id: string;
  name: string;
  symbol: string;
}

interface Pool {
  id: string;
  createdTimestamp: string;
  name: string;
  inputTokens: PoolToken[];
}

interface GraphQLData {
  liquidityPools: Pool[];
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
query GetPools($lastTimestamp: BigInt) {
  liquidityPools(
    first: 1000
    orderBy: createdTimestamp
    orderDirection: asc
    where: { createdTimestamp_gt: $lastTimestamp }
  ) {
    id
    createdTimestamp
    name
    inputTokens {
      symbol
      name
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

async function fetchData(subgraphUrl: string, lastTimestamp: bigint): Promise<Pool[]> {
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

  if (!result.data || !result.data.liquidityPools) {
    throw new Error("No pools data found.");
  }

  return result.data.liquidityPools;
}

function transformPoolsToTags(chainId: string, pools: Pool[]): ContractTag[] {
  return pools.map((pool) => {
    const symbols = pool.inputTokens.map((t) => t.symbol).sort();
    const publicNameTag = pool.name;
    const publicNote = `A Uniswap V3 pool with tokens ${symbols.join(", ")}.`;

    return {
      "Contract Address": `eip155:${chainId}:${pool.id}`,
      "Public Name Tag": publicNameTag,
      "Project Name": "Uniswap v3",
      "UI/Website Link": `https://info.uniswap.org/#/arbitrum/pools/${pool.id}`,
      "Public Note": publicNote,
    };
  });
}

class TagService implements ITagService {
  returnTags = async (chainId: string, apiKey: string): Promise<ContractTag[]> => {
    if (chainId !== "42161") {
      throw new Error(`Unsupported Chain ID: ${chainId}.`);
    }

    const subgraphUrl = SUBGRAPH_URL_TEMPLATE.replace("[api-key]", apiKey);

    let lastTimestamp: bigint = BigInt(0);
    let allTags: ContractTag[] = [];
    let isMore = true;

    while (isMore) {
      try {
        const pools = await fetchData(subgraphUrl, lastTimestamp);
        allTags.push(...transformPoolsToTags(chainId, pools));

        isMore = pools.length === 1000;
        if (isMore) {
          lastTimestamp = BigInt(pools[pools.length - 1].createdTimestamp);
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
