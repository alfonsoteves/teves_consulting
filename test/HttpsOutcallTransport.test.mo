import HttpsOutcallTransport "../src/teves_consulting_backend/lib/HttpsOutcallTransport";

let request = HttpsOutcallTransport.requestForProbe();

assert request.url == "https://www.tevesconsulting.com/";
assert request.max_response_bytes == ?32_768;
assert request.headers.size() == 0;
assert request.body == null;
assert request.method == #get;
assert request.transform == null;
assert request.is_replicated == ?false;
