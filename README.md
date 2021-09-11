# GraphQL Codegen - Apollo React Suspense

This is a plugin for [graphl codegen](https://www.graphql-code-generator.com/), it is designed for use with [apollo](https://www.apollographql.com/docs/) along with [React Suspense](https://reactjs.org/docs/concurrent-mode-suspense.html).

## What is this?

This creates a data repository for each query and mutation in your application (subscriptions are not supported yet).  
By using these repositories you can use suspense with apollo or migrate your app to use suspense.

## Setup

Follow the [official setup guide](https://www.graphql-code-generator.com/docs/getting-started/installation) if your are not already using codegen.
Then update your config to use this package.

```diff
schema: https://graphql-weather-api.herokuapp.com
overwrite: true
documents: src/**/*.graphql
generates:
  src/generated/schema.tsx:
    - "typescript"
    - "typescript-operations"
    - typescript-react-apollo
+   - codegen-apollo-suspense
```

In the setup example we have this query.

```gql
query GetWeather($city: String!, $country: String!) {
  getCityByName(name: $city, country: $country, config: {
    units: metric,
    lang: en,
  }) {
    id
    name
    country
    weather {
      summary {
        title
        description
        icon
      }
      temperature {
        actual
        feelsLike
      }
      wind {
        speed
      }
      clouds {
        all
        visibility
        humidity
      }
      timestamp
    }
  }
}
```

Suspense can now be used in the application.

Here is sn example with hooks.

```tsx
import React from 'react';
import { useGetWeatherQuery } from '../generated/schema';

const Temperature: React.FC = () => {
    const { data, loading, error } = useGetWeatherQuery({
        variables: {
            country: 'au',
            city: 'melbourne',
        }
    });

    if (loading) return <div>Loading</div>;
    if (error) throw new Error(error.message);

    return <div>{ data.getCityByName?.weather?.temperature?.actual }</div>);
}

const Widget: React.FC = () => (
    <ErrorBoundary fallback={ErrorPanel}>
        <Temperature />
    </ErrorBoundary>
)
```

_note: the throw is to just make the examples more comparable_

Now with suspense.

```tsx
import React, { Suspense } from 'react';
import { useGetWeatherSuspenseQuery } from '../generated/schema';

const Temperature: React.FC = () => {
    const data = useGetWeatherSuspenseQuery({
        variables: {
            country: 'au',
            city: 'melbourne',
        }
    });

    return <div>{ data.getCityByName?.weather?.temperature?.actual }</div>);
}

const Widget: React.FC = () => (
    <ErrorBoundary fallback={ErrorPanel}>
        <Suspense fallback={<div>Loading</div>}>
            <Temperature />
        </Suspense>
    </ErrorBoundary>
)
```
