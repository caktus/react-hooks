import React from "react";
import useRequest, {
  defaultInitialState,
  expandLoadingDependencies,
  defaultRequestReducer,
  getUrl,
  RequestProvider,
  FETCH_START,
  FETCH_FAILURE,
  FETCH_SUCCESS,
} from "./use-request";
import { renderHook, act } from "@testing-library/react-hooks";

const DATASET_ONE = "DATASET_ONE";
const DATASET_TWO = "DATASET_TWO";
const FALSE_DATASET = "FALSE_DATASET";
const URL = "https://testing.org/resource/";
const datasets = {
  [DATASET_ONE]: URL,
  [DATASET_TWO]: (id) => `${URL}${id}/`,
};

const RequestContextWrapper = ({ children }) => (
  <RequestProvider datasets={datasets}>{children}</RequestProvider>
);

describe("useRequest", () => {
  it("calls the hook successfully with default values", () => {
    const { result } = renderHook(() => useRequest(), {
      wrapper: RequestContextWrapper,
    });
    const expectedFunctions = [
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "cancel",
    ];
    const [request, state] = result.current;
    expect(state).toEqual(defaultInitialState);
    expectedFunctions.forEach((func) => {
      expect(request).toHaveProperty(func);
      expect(typeof request[func]).toEqual("function");
    });
  });

  /**
   * TODO:
   *   - test user provided reducer
   *   - test custom configs
   */
});

/**
 * Unit tests
 */
describe("expandLoadingDependencies", () => {
  it("should take a list of dependencies and turn it into a map of loading states", () => {
    const dependencies = ["DEP_1", "DEP_2", "DEP_3"];
    const expectedTrueLoadingStates = {
      DEP_1: true,
      DEP_2: true,
      DEP_3: true,
    };
    expect(expandLoadingDependencies(dependencies, true)).toEqual(
      expectedTrueLoadingStates
    );

    const expectedFalseLoadingStates = {
      DEP_1: false,
      DEP_2: false,
      DEP_3: false,
    };
    expect(expandLoadingDependencies(dependencies, false)).toEqual(
      expectedFalseLoadingStates
    );
  });
});

describe("defaultRequestReducer", () => {
  const DATASET_ONE = "DATASET_ONE";
  const DATASET_TWO = "DATASET_TWO";
  const DEPENDENCY_ONE = "DEPENDENCY_ONE";
  const DEPENDENCY_TWO = "DEPENDENCY_TWO";
  const previousData = {
    [DATASET_ONE]: "testData1",
  };
  const previousErrors = {
    [DATASET_ONE]: ["testError1"],
    [DATASET_TWO]: ["testError2"],
  };
  const previousLoading = {
    [DATASET_ONE]: false,
    [DATASET_TWO]: true,
  };
  const previousState = {
    data: previousData,
    errors: previousErrors,
    loading: previousLoading,
  };
  it("FETCH_START should set a dataset and dependencies to loading and pass through state for error and data", () => {
    const action = {
      type: FETCH_START,
      dataset: DATASET_ONE,
      dependencies: [DEPENDENCY_ONE, DEPENDENCY_TWO],
    };

    const newState = defaultRequestReducer(previousState, action);

    expect(newState).toHaveProperty("data");
    expect(newState.data).toEqual(previousData);

    expect(newState).toHaveProperty("errors");
    expect(newState.errors).toEqual(previousErrors);

    expect(newState).toHaveProperty("loading");
    expect(newState.loading).toEqual({
      ...previousLoading,
      [DATASET_ONE]: true,
      [DEPENDENCY_ONE]: true,
      [DEPENDENCY_TWO]: true,
    });
  });

  it("FETCH_SUCCESS should turn off loading for dataset and dependencies, set data for dataset, and clear errors for dataset", () => {
    const newData = "my new data";
    const action = {
      type: FETCH_SUCCESS,
      dataset: DATASET_ONE,
      payload: newData,
      dependencies: [DEPENDENCY_ONE, DEPENDENCY_TWO],
    };

    const newState = defaultRequestReducer(previousState, action);

    expect(newState).toHaveProperty("data");
    expect(newState.data).toEqual({
      ...previousData,
      [DATASET_ONE]: newData,
    });

    expect(newState).toHaveProperty("errors");
    expect(newState.errors).toHaveProperty(DATASET_ONE);
    expect(newState.errors[DATASET_ONE]).toBeNull();

    expect(newState).toHaveProperty("loading");
    expect(newState.loading).toEqual({
      ...previousLoading,
      [DATASET_ONE]: false,
      [DEPENDENCY_ONE]: false,
      [DEPENDENCY_TWO]: false,
    });
  });

  it("FETCH_FAILURE should turn off loading for dataset and dependencies, pass through data, and set errors for dataset", () => {
    const newError = "my new error";
    const action = {
      type: FETCH_FAILURE,
      dataset: DATASET_ONE,
      payload: newError,
      dependencies: [DEPENDENCY_ONE, DEPENDENCY_TWO],
    };

    const newState = defaultRequestReducer(previousState, action);

    expect(newState).toHaveProperty("data");
    expect(newState.data).toEqual(previousData);

    expect(newState).toHaveProperty("errors");
    expect(newState.errors).toHaveProperty(DATASET_ONE);
    expect(newState.errors[DATASET_ONE]).toEqual(newError);

    expect(newState).toHaveProperty("loading");
    expect(newState.loading).toEqual({
      ...previousLoading,
      [DATASET_ONE]: false,
      [DEPENDENCY_ONE]: false,
      [DEPENDENCY_TWO]: false,
    });
  });

  it("should pass through all state if invalid type is provided", () => {
    const action = {
      type: "NOT_A_REAL_TYPE",
      dataset: DATASET_ONE,
    };

    const newState = defaultRequestReducer(previousState, action);
    expect(newState).toEqual(previousState);
  });
});

describe("getUrl", () => {
  it("should throw an error if invalid dataset provided", () => {
    expect(() => getUrl(datasets, FALSE_DATASET)).toThrow(
      `Received unregistered dataset "${FALSE_DATASET}". Could not generate url.`
    );
  });

  it("should return mapped string for string-type url accessor", () => {
    const url = getUrl(datasets, DATASET_ONE);
    expect(typeof url).toBe("string");
    expect(url).toEqual(URL);
  });

  it("should return constructed string for function-type url accessor", () => {
    const id = 1;
    const url = getUrl(datasets, DATASET_TWO, { urlParams: id });
    expect(typeof url).toBe("string");
    expect(url).toEqual(URL + id + "/");
  });

  it("should throw an error if calling function-type url accessor without urlParams", () => {
    expect(() => getUrl(datasets, DATASET_TWO)).toThrow(
      `Tried to generate URL for ${DATASET_TWO}, but urlParams were "undefined"`
    );
  });

  it("should throw an error if unsupported url accessor type defined", () => {
    const DATASET_THREE = "DATASET_THREE";
    datasets[DATASET_THREE] = { urlAccessor: "Invalid" };
    expect(() => getUrl(datasets, DATASET_THREE)).toThrow(
      `Received an unsupported type "object" dataset url for dataset ${DATASET_THREE}. Dataset urls can be strings or functions.`
    );
  });

  it("should append query params to string-based url accessor", () => {
    const param1 = "param1";
    const val1 = "val1";
    const param2 = "param2";
    const val2 = "val2";
    const searchParams = {
      [param1]: "val1",
      [param2]: "val2",
    };
    const url = getUrl(datasets, DATASET_ONE, { searchParams });
    expect(url).toContain("?");
    expect(url).toContain(`${param1}=${val1}`);
    expect(url).toContain(`${param2}=${val2}`);
  });

  it("should append query params to function-based url accessor", () => {
    const param1 = "param1";
    const val1 = "val1";
    const param2 = "param2";
    const val2 = "val2";
    const searchParams = {
      [param1]: "val1",
      [param2]: "val2",
    };
    const url = getUrl(datasets, DATASET_ONE, { searchParams, urlParams: 1 });
    expect(url).toContain("?");
    expect(url).toContain(`${param1}=${val1}`);
    expect(url).toContain(`${param2}=${val2}`);
  });
});
