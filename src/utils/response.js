export const successResponse = (res, data, meta = null, status = 200) => {
  const payload = {
    success: true,
    data,
  };

  if (meta) {
    payload.meta = meta;
  }

  return res.status(status).json(payload);
};

export const errorResponse = (
  res,
  message,
  status = 400,
  errors = undefined
) => {
  const payload = {
    success: false,
    message,
  };

  if (errors) {
    payload.errors = errors;
  }

  return res.status(status).json(payload);
};

export default {
  successResponse,
  errorResponse,
};
