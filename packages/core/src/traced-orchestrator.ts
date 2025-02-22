import { DocumentNode, ExecutionArgs, GraphQLFieldResolver, GraphQLSchema, GraphQLTypeResolver, SubscriptionArgs } from 'graphql';
import { Maybe } from 'graphql/jsutils/Maybe';
import { ArbitraryObject } from 'packages/types/src/get-enveloped';
import { EnvelopOrchestrator } from './orchestrator';

const HR_TO_NS = 1e9;
const NS_TO_MS = 1e6;

const deltaFrom = (hrtime: [number, number]) => {
  const delta = process.hrtime(hrtime);
  const ns = delta[0] * HR_TO_NS + delta[1];

  return ns / NS_TO_MS;
};

export function traceOrchestrator<TInitialContext extends ArbitraryObject, TPluginsContext extends ArbitraryObject>(
  orchestrator: EnvelopOrchestrator<TInitialContext, TPluginsContext>
): EnvelopOrchestrator<TInitialContext & { _envelopTracing?: {} }, TPluginsContext> {
  const createTracer = (name: string, ctx: Record<string, any>) => {
    const hrtime = process.hrtime();

    return () => {
      const time = deltaFrom(hrtime);
      ctx._envelopTracing[name] = time;
    };
  };

  return {
    ...orchestrator,
    parse: (ctx = {} as any) => {
      ctx._envelopTracing = ctx._envelopTracing || {};
      const actualFn = orchestrator.parse(ctx);

      return (...args) => {
        const done = createTracer('parse', ctx);

        try {
          return actualFn(...args);
        } finally {
          done();
        }
      };
    },
    validate: (ctx = {} as any) => {
      ctx._envelopTracing = ctx._envelopTracing || {};
      const actualFn = orchestrator.validate(ctx);

      return (...args) => {
        const done = createTracer('validate', ctx);

        try {
          return actualFn(...args);
        } finally {
          done();
        }
      };
    },
    execute: async (
      argsOrSchema: ExecutionArgs | GraphQLSchema,
      document?: DocumentNode,
      rootValue?: any,
      contextValue?: any,
      variableValues?: Maybe<{ [key: string]: any }>,
      operationName?: Maybe<string>,
      fieldResolver?: Maybe<GraphQLFieldResolver<any, any>>,
      typeResolver?: Maybe<GraphQLTypeResolver<any, any>>
    ) => {
      const args: ExecutionArgs =
        argsOrSchema instanceof GraphQLSchema
          ? {
              schema: argsOrSchema,
              document: document!,
              rootValue,
              contextValue,
              variableValues,
              operationName,
              fieldResolver,
              typeResolver,
            }
          : argsOrSchema;

      const done = createTracer('execute', args.contextValue || {});

      try {
        const result = await orchestrator.execute(args);
        done();
        result.extensions = result.extensions || {};
        result.extensions.envelopTracing = args.contextValue._envelopTracing;

        return result;
      } catch (e) {
        done();

        throw e;
      }
    },
    subscribe: async (
      argsOrSchema: SubscriptionArgs | GraphQLSchema,
      document?: DocumentNode,
      rootValue?: any,
      contextValue?: any,
      variableValues?: Maybe<{ [key: string]: any }>,
      operationName?: Maybe<string>,
      fieldResolver?: Maybe<GraphQLFieldResolver<any, any>>,
      subscribeFieldResolver?: Maybe<GraphQLFieldResolver<any, any>>
    ) => {
      const args: SubscriptionArgs =
        argsOrSchema instanceof GraphQLSchema
          ? {
              schema: argsOrSchema,
              document: document!,
              rootValue,
              contextValue,
              variableValues,
              operationName,
              fieldResolver,
              subscribeFieldResolver,
            }
          : argsOrSchema;
      const done = createTracer('subscribe', args.contextValue || {});

      try {
        return await orchestrator.subscribe(args);
      } finally {
        done();
      }
    },
    contextFactory: (ctx = {} as any) => {
      const actualFn = orchestrator.contextFactory(ctx);

      return async childCtx => {
        const done = createTracer('contextFactory', ctx);

        try {
          return await actualFn(childCtx);
        } finally {
          done();
        }
      };
    },
  };
}
