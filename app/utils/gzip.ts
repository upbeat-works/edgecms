// @ts-nocheck
import zlib from 'node:zlib';

export async function gzipString(str: string): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		zlib.gzip(Buffer.from(str), (err, result) => {
			if (err) reject(err);
			resolve(result);
		});
	});
}

export async function gunzipString(buffer: Uint8Array): Promise<string> {
	return new Promise((resolve, reject) => {
		zlib.gunzip(Buffer.from(buffer), (err, result) => {
			if (err) reject(err);
			resolve(result.toString());
		});
	});
}
