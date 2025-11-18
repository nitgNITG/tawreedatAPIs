function convertStringBooleans(obj) {
  for (const key in obj) {
    if (obj[key] === "true") {
      obj[key] = true;
    } else if (obj[key] === "false") {
      obj[key] = false;
    } else if (obj[key] === "null") {
      obj[key] = null;
    }
  }
  return obj;
}

const transformToNestedObject = (arr) => {
  const result = {};
  const [firstKey, secondKey, value] = arr;
  const numericValue = isNaN(Number(value)) ? value : Number(value);
  const keywords = ["every_", "where_", "some_"];
  const matchedKeyword = keywords.find((keyword) =>
    firstKey.startsWith(keyword)
  );

  if (matchedKeyword) {
    const nestedKey = firstKey.slice(matchedKeyword.length);
    const operation = matchedKeyword.split("_")[0];

    // Create proper structure for Prisma relation filters
    result[nestedKey] = {
      [operation]: {
        [secondKey]: numericValue,
      },
    };
  } else {
    result[firstKey] = {
      [secondKey]: numericValue,
    };
  }
  return result;
};

function isDate(input) {
  if (!isNaN(input)) {
    return false;
  }
  const date = new Date(input);
  return date instanceof Date && !isNaN(date);
}

const isStringArray = (input) => {
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed);
  } catch {
    return false;
  }
};
// Combined normalizeValues function with date handling
const normalizeValues = (obj) => {
  const result = {};
  for (const key in obj) {
    const value = obj[key];
    // Parse stringified arrays
    if (
      (typeof value === "string" || typeof value === "object") &&
      (isStringArray(value) || Array.isArray(value))
    ) {
      const parsedArray = Array.isArray(value) ? value : JSON.parse(value);
      result[key] = parsedArray.map((item) => {
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          // ✅ Recursively normalize objects inside arrays
          return normalizeValues(item);
        }
        if (item === "true") return true;
        if (item === "false") return false;
        if (item === "null") return null;
        const num = Number(item);
        return isNaN(num) ? item : num;
      });
    } else if (isDate(value)) {
      result[key] = new Date(value);
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      result[key] = normalizeValues(value);
    } else if (value === "{}") {
      result[key] = {};
    } else if (value === "null") {
      result[key] = null;
    } else {
      const numberValue = Number(value);
      result[key] = isNaN(numberValue) ? value : numberValue;
    }
  }
  return result;
};

class FeatureApi {
  constructor(req) {
    this.req = req;
    this.data = {};
  }

  filter(filterData) {
    let query = JSON.parse(JSON.stringify(this.req.query));
    const arrData = [
      "fields",
      "sort",
      "limit",
      "keyword",
      "select",
      "page",
      "skip",
      "items",
      "lang",
      "op",
    ];
    arrData.forEach((element) => {
      delete query[element];
    });

    if (query) {
      let newQuery = { ...query };
      if (filterData) newQuery = { ...newQuery, ...filterData };

      // Process special prefixes first
      for (const key in newQuery) {
        const keywords = ["every_", "where_", "some_"];
        const matchedKeyword = keywords.find((keyword) =>
          key.startsWith(keyword)
        );

        if (
          matchedKeyword &&
          typeof newQuery[key] === "string" &&
          newQuery[key].includes("=")
        ) {
          const value = newQuery[key];
          const parts = value.split("=");
          const nestedKey = key.slice(matchedKeyword.length);
          const operation = matchedKeyword.split("_")[0];

          // Create proper structure and remove original key
          delete newQuery[key];

          // Handle nested fields (e.g., role=name=value)
          if (parts.length >= 3) {
            // For nested fields like role=name=value
            const nestedField = parts[0];
            const nestedSubField = parts[1];
            const fieldValue = parts[2];
            const numericValue = isNaN(Number(fieldValue))
              ? fieldValue
              : Number(fieldValue);

            newQuery[nestedKey] = {
              [operation]: {
                [nestedField]: {
                  [nestedSubField]: numericValue,
                },
              },
            };
          } else {
            // For simple fields like roleId=1
            const fieldName = parts[0];
            const fieldValue = parts[1];
            const numericValue = isNaN(Number(fieldValue))
              ? fieldValue
              : Number(fieldValue);

            newQuery[nestedKey] = {
              [operation]: {
                [fieldName]: numericValue,
              },
            };
          }
        }
      }

      // Then normalize remaining values
      let where = normalizeValues(newQuery);

      // Process any remaining string values with "="
      for (const key in where) {
        const value = where[key];
        if (typeof value === "string" && value.includes("=")) {
          const newKey = value.split("=");
          where[key] = transformToNestedObject(newKey);
        }
      }

      this.data.where = convertStringBooleans(where);
    }
    return this;
  }

  // Rest of the class remains unchanged
  sort(sortData) {
    let sort = this.req.query.sort || sortData;
    if (sort) {
      const sortFields = sort.split(",");
      const orderBy = sortFields.map((field) => {
        const order = field.startsWith("-") ? "desc" : "asc";
        const fieldName = field.replace(/^-/, "");

        // Handle nested sorting
        if (fieldName.includes(".")) {
          const fields = fieldName.split(".");
          let nestedSort = {};
          let current = nestedSort;

          // Build nested object structure
          fields.forEach((f, index) => {
            if (index === fields.length - 1) {
              current[f] = order;
            } else {
              current[f] = {};
              current = current[f];
            }
          });

          return nestedSort;
        }

        return { [fieldName]: order };
      });
      this.data.orderBy = orderBy;
    }
    return this;
  }

  // Helper method to build nested select object recursively
  buildSelectObject(fieldArray, index = 0) {
    if (index === fieldArray.length - 1) {
      // Base case: last field, just return true
      return { [fieldArray[index].trim()]: true };
    }

    // Recursive case: build nested structure
    const currentField = fieldArray[index].trim();
    return {
      [currentField]: {
        select: this.buildSelectObject(fieldArray, index + 1),
      },
    };
  }

  // Helper method to process field with dot notation or equals notation
  processFieldWithDotNotation(field) {
    if (field.includes("=")) {
      // Handle equals notation like GiftCardFrom=QR
      const parts = field.split("=");
      const key = parts[0].trim();
      const remainingPath = parts.slice(1).join("=");

      return {
        [key]: {
          select: this.buildNestedSelectFromPath(remainingPath),
        },
      };
    } else if (field.includes(".")) {
      // Handle dot notation like user.profile.name
      const parts = field.split(".");
      return this.buildSelectObject(parts);
    }
    return { [field.trim()]: true };
  }

  // Helper method to build nested select from dash-separated fields
  buildNestedSelect(fieldPath) {
    const fields = fieldPath.split("-");

    // Process each field in the dash-separated list
    return fields.reduce((selectObj, field) => {
      const processedField = this.processFieldWithDotNotation(field);
      return { ...selectObj, ...processedField };
    }, {});
  }

  // Helper method to build nested select for dot notation
  buildDotNotationSelect(fieldParts, index = 0) {
    if (index === fieldParts.length - 1) {
      return { [fieldParts[index]]: true };
    }

    return {
      [fieldParts[index]]: {
        select: this.buildDotNotationSelect(fieldParts, index + 1),
      },
    };
  }

  // Helper method to merge nested select objects
  mergeNestedSelects(target, source) {
    for (const key in source) {
      if (target[key]) {
        if (
          typeof target[key] === "object" &&
          target[key].select &&
          typeof source[key] === "object" &&
          source[key].select
        ) {
          // Both have select objects, merge them recursively
          target[key].select = this.mergeNestedSelects(
            target[key].select,
            source[key].select
          );
        } else if (typeof source[key] === "object" && source[key].select) {
          // Source has select, target doesn't
          target[key] = source[key];
        }
        // If target has select but source doesn't, keep target as is
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  parseFields(fieldsString) {
    return fieldsString.split(",").reduce((acc, field) => {
      if (field.includes("=")) {
        // Handle nested assignment like wallet=user=id-fullname
        const parts = field.split("=");
        const key = parts[0].trim();

        if (parts.length > 2) {
          // Multiple levels: wallet=user=id-fullname
          const remainingPath = parts.slice(1).join("=");
          const nestedSelect = this.buildNestedSelectFromPath(remainingPath);
          acc[key] = {
            select: nestedSelect,
          };
        } else {
          // Single level: brand=id-name
          const value = parts[1];
          if (value.includes("take")) {
            console.log(value);
          }

          acc[key] = {
            select: this.buildNestedSelect(value),
          };
        }
      } else if (field.includes(".")) {
        // Handle dot notation for simple fields (e.g., user.profile.name)
        const parts = field.trim().split(".");
        const nestedSelect = this.buildDotNotationSelect(parts);
        acc = this.mergeNestedSelects(acc, nestedSelect);
      } else {
        acc[field.trim()] = true;
      }
      return acc;
    }, {});
  }

  // Helper method to build nested select from path with multiple equals
  buildNestedSelectFromPath(path) {
    if (path.includes("=")) {
      // Split only on the first = to handle nested structures properly
      const firstEqualIndex = path.indexOf("=");
      const beforeEqual = path.substring(0, firstEqualIndex).trim();
      const afterEqual = path.substring(firstEqualIndex + 1);

      // Check if the part before = contains dashes (meaning it's multiple fields)
      if (beforeEqual.includes("-")) {
        // This means we have something like "id-fullname-GiftCardFrom=QR"
        // We need to split this into: id, fullname, and GiftCardFrom=QR
        const dashParts = beforeEqual.split("-");
        const lastPart = dashParts.pop(); // Remove the last part (GiftCardFrom)

        // Build select for the dash-separated parts first (id, fullname)
        let result = {};
        dashParts.forEach((part) => {
          result[part.trim()] = true;
        });

        // Then add the nested part (GiftCardFrom=QR)
        const nestedField = lastPart + "=" + afterEqual;
        const processedNested = this.processFieldWithDotNotation(nestedField);
        result = { ...result, ...processedNested };

        return result;
      } else {
        // Normal case: just one field before =
        return {
          [beforeEqual]: {
            select: this.buildNestedSelectFromPath(afterEqual),
          },
        };
      }
    } else {
      // Last level - process as dash-separated fields
      return this.buildNestedSelect(path);
    }
  }

  fields(select, dataSelect) {
    const queryFields = this.req.query.fields;

    let fields;
    if (queryFields) {
      fields = this.parseFields(queryFields);
    } else if (select) {
      fields = this.parseFields(select);
    } else {
      fields = undefined;
    }

    const d = { ...dataSelect, ...(fields || {}) };
    if (fields) {
      this.data.select = d;
    }

    return this;
  }

  limit(limitData) {
    const limitQuery = parseInt(this.req.query.limit) || limitData;
    if (limitQuery) {
      this.data.take = limitQuery;
    }
    return this;
  }
  keyword(itemsData, opData) {
    let keyword = this.req.query.keyword;
    let op = this.req.query?.op || opData;
    let items = this.req.query?.items?.split(",") || itemsData;
    let conditions = [];

    // Recursive function to build nested query structure
    const buildNestedQuery = (fieldParts, index = 0) => {
      if (index === fieldParts.length - 1) {
        // Base case: return the final condition
        return {
          contains: keyword,
        };
      }

      // Recursive case: build nested structure
      return {
        [fieldParts[index + 1]]: buildNestedQuery(fieldParts, index + 1),
      };
    };

    if (keyword) {
      for (const field of items) {
        if (field.includes(".enum")) {
          const [fieldName] = field.split(".enum");
          if (keyword === keyword.toUpperCase() && !keyword.includes(" ")) {
            conditions.push({
              [fieldName]: {
                equals: keyword,
              },
            });
          }
        } else if (field.includes(".")) {
          // Handle nested fields with multiple dots using recursion
          const fieldParts = field.split(".");
          conditions.push({
            [fieldParts[0]]: buildNestedQuery(fieldParts),
          });
        } else {
          conditions.push({
            [field]: {
              contains: keyword,
            },
          });
        }
      }
      if (conditions.length > 0) {
        this.data.where = this.data.where || {};
        this.data.where[op] = conditions;
      }
    }

    return this;
  }

  skip(skipData) {
    const skip = parseInt(this.req.query.skip) || skipData;
    if (skip) {
      this.data.skip = skip;
    }
    return this;
  }

  distinct(feild) {
    const distinct = this.req.query.distinct || feild;
    if (distinct) {
      this.data.distinct = distinct;
    }
    return this;
  }
}

export default FeatureApi;
