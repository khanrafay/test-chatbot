const request = async (url, options) => {
  return await fetch(url, {
    ...options,
      mode: 'cors',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'accepts': 'application/json',
        ...options?.headers,
      }
  });
}

module.exports = request;