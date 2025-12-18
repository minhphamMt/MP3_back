export const getPaginationParams = (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limitInput = parseInt(query.limit || query.pageSize, 10);
  const limit = Math.min(Math.max(limitInput || 10, 1), 100);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

export const buildPaginationMeta = (page, limit, total) => {
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);

  return {
    page,
    limit,
    total,
    totalPages,
  };
};

export default {
  getPaginationParams,
  buildPaginationMeta,
};
