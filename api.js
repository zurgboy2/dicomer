const handleApiError = (error, response) => {
  console.error('API call failed:', error);
  if (response) {
    throw new Error(`Server error: ${response.status} ${response.statusText}`);
  } else if (error.request) {
    throw new Error('No response from server');
  } else {
    throw new Error('Error setting up request');
  }
};

const getProxyToken = async (action) => {
    const url = new URL('https://isa-scavenger-761151e3e681.herokuapp.com/get_token');
    try {
        const response = await fetch(url, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
            script_id: 'dicom_script', 
            action: action
        }),
        });

        if (!response.ok) {
        const errorText = await response.text();
        handleApiError(new Error(errorText), response);
        }

        const data = await response.json();
        if (data.token) return data.token;
        throw new Error('Failed to get token: ' + JSON.stringify(data));
    } catch (error) {
        handleApiError(error);
    }
};

const apiCall = async (action, additionalData = {}) => {
  try {
    const token = await getProxyToken(action);
    const url = new URL('https://isa-scavenger-761151e3e681.herokuapp.com/proxy');

    const googleToken = localStorage.getItem('googleToken');
    const username = localStorage.getItem('username');

    const requestBody = { 
      token, 
      action, 
      script_id: 'dicom_script'
    };

    if (googleToken) requestBody.googleToken = googleToken;
    if (username) requestBody.username = username;

    for (const [key, value] of Object.entries(additionalData)) {
      if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
        requestBody[key] = await blobToBase64(new Blob([value]));
      } else if (typeof value === 'object' && value !== null) {
        requestBody[key] = JSON.stringify(value);
      } else {
        requestBody[key] = value;
      }
    }

    // Log the size of the request body
    const requestBodyString = JSON.stringify(requestBody);
    const requestBodySize = new Blob([requestBodyString]).size;
    console.log(`Request body size: ${requestBodySize} bytes`);

    // If the size is very large, log more details
    if (requestBodySize > 1000000) { // Log if larger than 1MB
      console.log('Large request details:');
      for (const [key, value] of Object.entries(requestBody)) {
        if (typeof value === 'string') {
          console.log(`${key}: ${value.length} characters`);
        } else {
          console.log(`${key}: ${JSON.stringify(value).length} characters`);
        }
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBodyString,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
};
// Helper function to convert Blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default apiCall;