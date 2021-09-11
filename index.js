const { ClientSideBaseVisitor, DocumentMode } = require("@graphql-codegen/visitor-plugin-common");
const { concatAST, visit, Kind } = require("graphql");
const { pascalCase } = require('change-case-all');
const { extname } = require("path");

const lowerCaseFirstLetter = term => `${term.charAt(0).toLowerCase()}${term.slice(1)}`.replace(/Query$/, '').replace(/Mutation$/, '');

const createRepo = `interface RepositoryOptions<TArgs extends unknown[] = []> {
    toCacheKey?: (...args: Partial<TArgs>) => string;
}

export function createRepository<TReturn, TArgs extends unknown[] = []>(
    fetcher: (...args: TArgs) => Promise<TReturn>,
    options?: RepositoryOptions<TArgs>
) {
    let cache: Record<string, TReturn> = {};
    return {
        read: (...args: TArgs): TReturn => {
            const generateCacheKey = options?.toCacheKey ?? hash;
            const cacheKey = args ? generateCacheKey(args) : 'default';
            if (cache[cacheKey] === undefined) throw fetcher(...args).then(value => (cache[cacheKey] = value));
            else return cache[cacheKey];
        }
    }
}
`;

class Visitor extends ClientSideBaseVisitor {
    constructor(schema, fragments, config, documents) {
        super(schema, fragments, config, {
            documentMode: config.useExternalDocument ? DocumentMode.external : DocumentMode.graphQLTag,
        }, documents);

        this._documents = documents;
        this.__mutationNames = [];
        this.__queryNames = [];
    }

    getImports = () => {
        const baseImports = [
            'import { useApolloClient, ApolloClient, QueryOptions } from \'@apollo/client\';',
            'import hash from \'object-hash\';',
            ...super.getImports(),
        ];

        const hasOperations = this._collectedOperations.length > 0;

        const types = [
            '\n',
            'type ApolloSuspenseArgs<TVariables extends {} = {}> = [ApolloClient<object>, TVariables];',
        ]

        return !hasOperations 
            ? baseImports
            : [...baseImports, ...Array.from(this._imports), ...types];
    }

    buildOperation = (node, documentVariableName, operationType, operationResultType, operationVariablesType, hasRequiredVars) => {
        const nodeName = node.name ? node.name.value : '';
        const suffix = pascalCase(operationType);

        const operationName = this.convertName(nodeName, {
            suffix,
            useTypesPrefix: false,
            useTypesSuffix: false,
        });

        const isMutation = operationType === 'Mutation';
        const isQuery = operationType === 'Query';

        if (isMutation && !isQuery) return '';

        const optionsTypeString = isMutation ? 'MutationOptions' : 'QueryOptions';
        const clientAction = isMutation ? 'mutate' : 'query';
        const documentKeyword = isMutation ? 'mutation' : 'query';

        const baseName = this.convertName(nodeName, {
            suffix: `Suspense${ isMutation ? 'Mutation' : 'Query' }`
        })

        // type Opts = Omit<QueryOptions<GetWeatherQueryVariables, GetWeatherQuery>, 'query'>
        const optionsType = `Omit<${optionsTypeString}<${operationVariablesType}, ${operationResultType}>, '${documentKeyword}'>`;

        const variablesStringGenerator = spaces => node.variableDefinitions.reduce((collection, item) => {
            const name = item.variable.name.value;
            return `${collection}\n* ${''.padStart(spaces, '\t')}${name}: // value for ${name}`;
        }, '')

        const ticks = '```';

        const comment = `/** 
* use${baseName}
*
* Use this hook to execure a ${documentKeyword} for use in React suspense.
* Please use an error boundary to catch any errors.
*
* @param options options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/core/#ApolloClient.${clientAction}
* 
* @example
* ${ticks}typescript
* const data = use${baseName}(${!node.variableDefinitions.length ? '' : `{
*       variables: {${variablesStringGenerator(3)}
*       }
*   }`});
* ${ticks}
*/`;

        const body = `
        const ${lowerCaseFirstLetter(baseName)} = createRepository<${operationResultType}, ApolloSuspenseArgs<${optionsType}>>(async (client: ApolloClient<object>, options: ${optionsType}) => {
            const { data } = await client.${clientAction}<${operationResultType}, ${operationVariablesType}>({
                ${documentKeyword}: ${documentVariableName},
                ...options,
            });
        
            return data;
        }, {
            toCacheKey: (_, variables) => {
                const { values } = Object;
                return values(variables || {}).join('-');
            }
        })

        ${comment}
        export const use${baseName} = (options: ${optionsType}) => {
            const client = useApolloClient();
            return ${lowerCaseFirstLetter(baseName)}.read(client, options);
        }`;

        (isMutation ? this.__mutationNames : this.__queryNames).push({
            name: operationName,
            action: clientAction,
            type: optionsType
        });

        /* TODO: JSDoc comments */

        return body;
    }

    createDependencies = () => {
        return [
            createRepo
        ];
    }
}

module.exports = {
    plugin: (schema, documents, config) => {
        const ast = concatAST(documents.map(z => z.document));

        const localFragments = ast
            .definitions
            .filter(z => z.kind === Kind.FRAGMENT_DEFINITION)
            .map(z => ({
                node: z,
                name: z.name.value,
                onType: z.typeCondition.value,
                isExternal: false,
            }))

        const fragments = [
            ...localFragments,
            ...(config.externalFragments || [])
        ];

        const visitor = new Visitor(schema, fragments, config, documents);
        const result = visit(ast, { leave: visitor });

        return {
            prepend: [
                ...visitor.getImports(),
                ...visitor.createDependencies(),
            ],
            content: [
                visitor.fragments,
                ...result.definitions.filter(z => typeof z === 'string'),
            ].join('\n')
        };
    },
    validate: async (schema, documents, config, outputFile) => {
        if (config.disableChecks) return;

        const validFileExtensions = ['.ts', '.tsx'];

        if (!validFileExtensions.includes(extname(outputFile))) {
            throw new Error('The output file must be a typescript file ending with either .ts or .tsx');
        }
    }
}
