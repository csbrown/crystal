import type { PgSource, PgTypeCodec } from "@dataplan/pg";
import type { TrackedArguments } from "graphile-crystal";
import { EXPORTABLE } from "graphile-exporter";
import type { GatherHooks, Plugin, PluginGatherConfig } from "graphile-plugin";
import type { GraphQLObjectType } from "graphql";
import { sign as signJwt } from "jsonwebtoken";

import { getBehavior } from "../behavior";
import { version } from "../index";

declare global {
  namespace GraphileEngine {
    interface GraphileBuildSchemaOptions {
      // TODO:
      pgJwtSecret?: any;
      pgJwtSignOptions?: any;
    }

    interface GraphileBuildGatherOptions {
      jwtType?: [string, string];
    }

    interface ScopeGraphQLScalarType {
      isPgJwtType?: boolean;
      pgCodec?: PgTypeCodec<any, any, any, any>;
    }
  }
}

declare module "graphile-plugin" {
  interface GatherHelpers {
    pgJWT: {};
  }
}

interface State {}
interface Cache {}

export const PgJWTPlugin: Plugin = {
  name: "PgJWTPlugin",
  description: "Converts a Postgres JWT object type into a signed JWT",
  version: version,

  before: ["PgCodecsPlugin", "PgTablesPlugin"],

  gather: {
    namespace: "pgJWT",
    helpers: {},
    hooks: {
      pgCodecs_PgTypeCodec(info, { pgCodec, pgType }) {
        if (
          info.options.jwtType?.[1] === pgType.typname &&
          info.options.jwtType?.[0] === pgType.getNamespace()!.nspname
        ) {
          // It's a JWT type!
          pgCodec.extensions ||= {};
          pgCodec.extensions.tags ||= {};
          pgCodec.extensions.tags.behavior = ["jwt"];
        }
      },
    },
  } as PluginGatherConfig<"pgJWT", State, Cache>,

  schema: {
    hooks: {
      init(_, build) {
        const {
          options: { pgJwtSecret, pgJwtSignOptions },
        } = build;
        const jwtCodec = [...build.pgCodecMetaLookup.keys()].find((codec) => {
          const behavior = getBehavior(codec.extensions);
          // TODO: why is b.jwt_token not found here?
          if (behavior?.includes("jwt")) {
            return true;
          }
          return false;
        });

        if (!jwtCodec) {
          return _;
        }

        const compositeTypeName = build.inflection.tableType(jwtCodec);
        const columns = Object.keys(jwtCodec.columns);

        build.registerScalarType(
          compositeTypeName,
          {
            isPgJwtType: true,
            pgCodec: jwtCodec,
          },
          () => ({
            description: build.wrapDescription(
              "A JSON Web Token defined by [RFC 7519](https://tools.ietf.org/html/rfc7519) which securely represents claims between two parties.",
              "type",
            ),
            serialize: EXPORTABLE(
              (columns, pgJwtSecret, pgJwtSignOptions, signJwt) =>
                function serialize(value: any) {
                  const token = columns.reduce((memo, columnName) => {
                    if (columnName === "exp") {
                      memo[columnName] = value[columnName]
                        ? parseFloat(value[columnName])
                        : undefined;
                    } else {
                      memo[columnName] = value[columnName];
                    }
                    return memo;
                  }, {} as any);
                  return signJwt(
                    token,
                    pgJwtSecret,
                    Object.assign(
                      {},
                      pgJwtSignOptions,
                      token.aud ||
                        (pgJwtSignOptions && pgJwtSignOptions.audience)
                        ? null
                        : {
                            audience: "postgraphile",
                          },
                      token.iss || (pgJwtSignOptions && pgJwtSignOptions.issuer)
                        ? null
                        : {
                            issuer: "postgraphile",
                          },
                      token.exp ||
                        (pgJwtSignOptions && pgJwtSignOptions.expiresIn)
                        ? null
                        : {
                            expiresIn: "1 day",
                          },
                    ),
                  );
                },
              [columns, pgJwtSecret, pgJwtSignOptions, signJwt],
            ),
          }),
          "JWT scalar from PgJWTPlugin",
        );

        return _;
      },
    },
  },
};