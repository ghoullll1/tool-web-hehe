package com.toolweb.platform.tool.document.client;

import com.toolweb.platform.tool.document.dto.DocumentConversionModels;

public interface DocumentConversionWorker {

    DocumentConversionModels.ConvertedDocument convert(
            DocumentConversionModels.ValidatedUpload upload,
            String requestId
    );
}
