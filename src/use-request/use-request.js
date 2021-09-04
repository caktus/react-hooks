import React from "react";

export const FETCH_START = "FETCH_START";
export const FETCH_SUCCESS = "FETCH_SUCCESS";
export const FETCH_FAILURE = "FETCH_FAILURE";

export const FETCH_DATA = "FETCH_DATA";
export const FETCH_LOADING = "FETCH_LOADING";
export const FETCH_ERRORS = "FETCH_ERRORS";

const REQUEST_ABORTED_ERROR = "DOMException: The user aborted a request.";

// PRIVATE VARIABLE: exported for tests
export const defaultInitialState = {
  data: {},
  loading: {},
  errors: {},
};

// PRIVATE FUNCTION: exported for tests
export function expandLoadingDependencies(dependencies, loading) {
  /**
   * Turn a list of dependencies in to an object of:
   * { dependency_name: loading_state }
   */
  const loadingState = {};
  dependencies.forEach((dep) => (loadingState[dep] = loading));
  return loadingState;
}

// PRIVATE FUNCTION: exported for tests
export function defaultRequestReducer(state, action) {
  switch (action.type) {
    /**
     * When fetch begins, pass on data and pass on errors:
     * Set loading on dataset key, as well as any dependencies passed in.
     */
    case FETCH_START:
      return {
        data: state.data,
        loading: {
          ...state.loading,
          [action.dataset]: true,
          ...expandLoadingDependencies(action.dependencies, true),
        },
        errors: state.errors,
      };
    /**
     * When fetch succeeds:
     * Add dataset to data, turn off loading for dataset and dependencies.
     * Set errors for this dataset to null.
     */
    case FETCH_SUCCESS:
      return {
        data: { ...state.data, [action.dataset]: action.payload },
        loading: {
          ...state.loading,
          [action.dataset]: false,
          ...expandLoadingDependencies(action.dependencies, false),
        },
        errors: { ...state.errors, [action.dataset]: null },
      };

    /**
     * When fetch fails, pass on data:
     * Turn off loading for dataset and dependencies. Set errors for this dataset.
     */
    case FETCH_FAILURE:
      return {
        data: state.data,
        loading: {
          ...state.loading,
          [action.dataset]: false,
          ...expandLoadingDependencies(action.dependencies, false),
        },
        errors: { ...state.errors, [action.dataset]: action.payload },
      };
    default:
      return state;
  }
}

/**
 * getUrl
 * @param {string} dataset - a dataset constant from a registered request url.
 * @param {object} [params] - an optional object of query params
 * @returns {string} A url build from dataset-url mapping and query string
 */
// PRIVATE FUNCTION: exported for tests
export function getUrl(datasets, dataset, { urlParams, searchParams } = {}) {
  /**
   * Given provided datasets object, generate the url.
   * datasets[dataset] may be a string or a function.
   * If it's a string, return the string with any searchParams attached.
   * If it's a function, execute the function with urlParams as argument.
   */

  /**
   * Throw error if provided dataset is not registered in datasets.
   */
  if (!datasets[dataset])
    throw new Error(
      `Received unregistered dataset "${dataset}". Could not generate url.`
    );

  let url = "";

  /**
   * If datasets[dataset] is a function, execute with urlParams and set url.
   * If it's a string, set url to datasets[dataset].
   * Else, it's some unsupported type. Throw an error.
   */
  const urlCreator = datasets[dataset];
  const typeofUrlCreator = typeof urlCreator;
  if (typeofUrlCreator === "function") {
    // Throw error if user accesses a dataset url as a function without providing urlParams
    if (!urlParams)
      throw new Error(
        `Tried to generate URL for ${dataset}, but urlParams were "${typeof urlParams}"`
      );
    url = urlCreator(urlParams);
  } else if (typeofUrlCreator === "string") {
    url = urlCreator;
  } else {
    throw new Error(
      `Received an unsupported type "${typeofUrlCreator}" dataset url for dataset ${dataset}. Dataset urls can be strings or functions.`
    );
  }

  /**
   * Finally, add any searchParams.
   * (Here we coerce URLSearchParams to a string via string concatenation)
   */
  if (searchParams) {
    url += "?";
    url += new URLSearchParams(searchParams);
  }
  return url;
}

/**
 * The meat of this implementation. useMakeRequest is a hook that
 * accepts an optional custom reducer, optional custom initial state,
 * optional global fetch config, and an optional onRequestFailure callback.
 */
// PRIVATE FUNCTION: exported for unittests
export function useMakeRequest({
  datasets,
  reducer = defaultRequestReducer,
  initialState = defaultInitialState,
  globalConfig,
  onRequestFailure,
} = {}) {
  const abortControllers = React.useRef({});
  const [state, dispatch] = React.useReducer(reducer, initialState);

  /**
   * We store abortControllers in a single ref instance to prevent
   * unnecessary updates. This method returns a signal to tie this
   * particular abortController to its fetch request.
   */
  const setUpAbortController = (dataset) => {
    abortControllers.current = {
      ...abortControllers.current,
      [dataset]: new AbortController(),
    };
    return abortControllers.current[dataset].signal;
  };

  /**
   * Start loading state for dataset and dependencies
   */
  const setFetchStart = (dataset, dependencies) => {
    dispatch({ type: FETCH_START, dependencies, dataset });
  };

  /**
   * Add payload to data for dataset, stop loading for dataset and dependencies
   */
  const setFetchSuccess = (dataset, payload, dependencies) => {
    dispatch({
      type: FETCH_SUCCESS,
      payload,
      dependencies,
      dataset,
    });
  };

  /**
   * Set errors for dataset, stop loading for dataset and errors
   * Also, if an onRequestFailure callback has been provided, call it here.
   */
  const setFetchFailure = (
    dataset,
    payload,
    dependencies,
    onRequestFailure
  ) => {
    if (onRequestFailure) onRequestFailure(payload);
    dispatch({
      type: FETCH_FAILURE,
      payload,
      dependencies,
      dataset,
    });
  };

  const _makeRequest = React.useCallback(
    async (method, dataset, config = {}) => {
      const { dependencies = [], urlParams = {}, searchParams = {} } = config;
      setFetchStart(dataset, dependencies);
      try {
        /**
         * fetch for dataset, including optional query string {params}
         * Add global config, then local config, then set signal for cancellation.
         */
        const response = await fetch(
          getUrl(datasets, dataset, { urlParams, searchParams }),
          {
            method,
            ...(globalConfig || {}),
            ...config,
            signal: setUpAbortController(dataset),
          }
        );
        const payload = await response.json();

        /**
         * Fetch does not throw errors for non-2xx responses. Instead,
         * it returns a response.ok boolean...
         */
        if (response.ok) setFetchSuccess(dataset, payload, dependencies);
        else setFetchFailure(dataset, payload, dependencies, onRequestFailure);
      } catch (e) {
        /**
         * ...nevertheless, one oddity of the fetch w/ AbortController implementation
         * is that it throws a DOMException every time a request is aborted. Let's
         * catch that exception to quiet down noise in the console.
         */
        if (e === REQUEST_ABORTED_ERROR) return;
      } finally {
        /**
         * Now that were done with this request, we can do some cleanup.
         * Remove this dataset key from the abortControllers object
         */
        delete abortControllers.current[dataset];
      }
    },
    [datasets, globalConfig, onRequestFailure]
  );

  /**
   * get, post, put, patch, and del (since delete is reserved) are
   * just syntactic sugar to allow the tidy api:
   *    request.get(MY_DATASET)
   */
  const get = React.useCallback(
    (...args) => _makeRequest("GET", ...args),
    [_makeRequest]
  );

  const post = React.useCallback(
    (...args) => _makeRequest("POST", ...args),
    [_makeRequest]
  );

  const put = React.useCallback(
    (...args) => _makeRequest("PUT", ...args),
    [_makeRequest]
  );

  const patch = React.useCallback(
    (...args) => _makeRequest("PATCH", ...args),
    [_makeRequest]
  );

  const del = React.useCallback(
    (...args) => _makeRequest("DELETE", ...args),
    [_makeRequest]
  );

  /**
   * Cancel a fetch request.
   * Pull the particular abortController our of our ref using the
   * dataset key and call abort.
   */
  const cancel = React.useCallback((dataset) => {
    if (abortControllers?.current[dataset]) {
      abortControllers.current[dataset].abort();
    }
  }, []);

  /**
   * Here we tie together all our request methods, including cancel
   * in to a single memoized object. The memoization is key here, as
   * React will otherwise treat an object returned from this hook
   * as a new object every time-- causing "request" to be redefined
   * every time it's called, causing infinit loops in useEffects.
   */
  const request = React.useMemo(
    () => ({ get, post, put, patch, delete: del, cancel }),
    [get, post, put, patch, del, cancel]
  );

  /**
   * Return request and state, where state is { data, errors, loading }
   */
  return [request, state];
}

const RequestContext = React.createContext(null);

/**
 * RequestProvider is the public side of this implementation. It wraps everythign up in a tidy Provider.
 * Wrap your App in this Provider. As props, provide:
 *    required datasets
 *    optional configuration
 * and the useRequest context will be available to every component.
 */
export function RequestProvider({
  children,
  datasets,
  defaultBaseUrl,
  reducer,
  initialState,
  globalConfig,
}) {
  const requestContext = useMakeRequest({
    datasets,
    reducer,
    initialState,
    globalConfig,
    defaultBaseUrl,
  });
  return (
    <RequestContext.Provider value={requestContext}>
      {children}
    </RequestContext.Provider>
  );
}

const useRequest = () => React.useContext(RequestContext);

export default useRequest;

/**
 * Global Dependency Constants
 * These are for indicating when certain sections of the app should be
 * set to a loading state.
 *
 * e.g. When loading user data, set GLOBAL as a dependency to indicate that
 * every section (that responds to 'loading') should show loading.
 */
/** @constant {string} */
export const GLOBAL = "GLOBAL";
