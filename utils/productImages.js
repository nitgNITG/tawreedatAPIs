const parseProductImages = (product) => {
  if (product.images !== undefined) {
    return {
      ...product,
      images: product.images ? JSON.parse(product.images) : [],
    };
  }
  return product;
};

const parseProductsImages = (products) => {
  if (!Array.isArray(products)) {
    return [];
  }
  // Map through products and apply parseProductImages function
  if (products.length === 0) {
    return [];
  }
  if (products[0].images !== undefined) {
    return products.map((product) => parseProductImages(product));
  }
  return products;
};

export { parseProductImages, parseProductsImages };
