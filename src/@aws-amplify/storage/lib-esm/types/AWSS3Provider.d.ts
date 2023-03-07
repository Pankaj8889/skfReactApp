import { GetObjectRequest, GetObjectCommandOutput, PutObjectRequest, CopyObjectRequest, _Object, DeleteObjectCommandOutput } from '@aws-sdk/client-s3';
import { StorageOptions, StorageAccessLevel } from './Storage';
import { UploadTaskCompleteEvent, UploadTaskProgressEvent } from '../providers/AWSS3UploadTask';
import { UploadTask } from './Provider';
import { ICredentials } from '@aws-amplify/core';
declare type ListObjectsCommandOutputContent = _Object;
export interface FileMetadata {
    bucket: string;
    fileName: string;
    key: string;
    lastTouched: number;
    uploadId: string;
}
export declare type CommonStorageOptions = Omit<StorageOptions, 'credentials' | 'region' | 'bucket' | 'dangerouslyConnectToHttpEndpointForTesting'>;
export declare type S3ProviderGetConfig = CommonStorageOptions & {
    download?: boolean;
    track?: boolean;
    expires?: number;
    provider?: 'AWSS3';
    identityId?: string;
    progressCallback?: (progress: any) => any;
    cacheControl?: GetObjectRequest['ResponseCacheControl'];
    contentDisposition?: GetObjectRequest['ResponseContentDisposition'];
    contentEncoding?: GetObjectRequest['ResponseContentEncoding'];
    contentLanguage?: GetObjectRequest['ResponseContentLanguage'];
    contentType?: GetObjectRequest['ResponseContentType'];
    SSECustomerAlgorithm?: GetObjectRequest['SSECustomerAlgorithm'];
    SSECustomerKey?: GetObjectRequest['SSECustomerKey'];
    SSECustomerKeyMD5?: GetObjectRequest['SSECustomerKeyMD5'];
};
export declare type S3ProviderGetOuput<T> = T extends {
    download: true;
} ? GetObjectCommandOutput : string;
declare type _S3ProviderPutConfig = {
    progressCallback?: (progress: any) => any;
    provider?: 'AWSS3';
    track?: boolean;
    serverSideEncryption?: PutObjectRequest['ServerSideEncryption'];
    SSECustomerAlgorithm?: PutObjectRequest['SSECustomerAlgorithm'];
    SSECustomerKey?: PutObjectRequest['SSECustomerKey'];
    SSECustomerKeyMD5?: PutObjectRequest['SSECustomerKeyMD5'];
    SSEKMSKeyId?: PutObjectRequest['SSEKMSKeyId'];
    acl?: PutObjectRequest['ACL'];
    bucket?: PutObjectRequest['Bucket'];
    cacheControl?: PutObjectRequest['CacheControl'];
    contentDisposition?: PutObjectRequest['ContentDisposition'];
    contentEncoding?: PutObjectRequest['ContentEncoding'];
    contentType?: PutObjectRequest['ContentType'];
    expires?: PutObjectRequest['Expires'];
    metadata?: PutObjectRequest['Metadata'];
    tagging?: PutObjectRequest['Tagging'];
    useAccelerateEndpoint?: boolean;
    resumable?: boolean;
};
export declare type ResumableUploadConfig = {
    resumable: true;
    progressCallback?: (progress: UploadTaskProgressEvent) => any;
    completeCallback?: (event: UploadTaskCompleteEvent) => any;
    errorCallback?: (err: any) => any;
};
export declare type S3ProviderPutConfig = CommonStorageOptions & (_S3ProviderPutConfig | (_S3ProviderPutConfig & ResumableUploadConfig));
export declare type S3ProviderRemoveConfig = CommonStorageOptions & {
    bucket?: string;
    provider?: 'AWSS3';
};
export declare type S3ProviderListOutput = {
    results: S3ProviderListOutputItem[];
    nextToken?: string;
    hasNextToken: boolean;
};
export declare type S3ProviderRemoveOutput = DeleteObjectCommandOutput;
export declare type S3ProviderListConfig = CommonStorageOptions & {
    bucket?: string;
    pageSize?: number | 'ALL';
    provider?: 'AWSS3';
    identityId?: string;
    nextToken?: string;
};
export declare type S3ClientOptions = StorageOptions & {
    credentials: ICredentials;
} & S3ProviderListConfig;
export interface S3ProviderListOutputItem {
    key: ListObjectsCommandOutputContent['Key'];
    eTag: ListObjectsCommandOutputContent['ETag'];
    lastModified: ListObjectsCommandOutputContent['LastModified'];
    size: ListObjectsCommandOutputContent['Size'];
}
export interface S3CopyTarget {
    key: string;
    level?: StorageAccessLevel;
    identityId?: string;
}
export declare type S3CopySource = S3CopyTarget;
export declare type S3CopyDestination = Omit<S3CopyTarget, 'identityId'>;
export declare type S3ProviderCopyConfig = Omit<CommonStorageOptions, 'level'> & {
    provider?: 'AWSS3';
    bucket?: CopyObjectRequest['Bucket'];
    cacheControl?: CopyObjectRequest['CacheControl'];
    contentDisposition?: CopyObjectRequest['ContentDisposition'];
    contentLanguage?: CopyObjectRequest['ContentLanguage'];
    contentType?: CopyObjectRequest['ContentType'];
    expires?: CopyObjectRequest['Expires'];
    tagging?: CopyObjectRequest['Tagging'];
    acl?: CopyObjectRequest['ACL'];
    metadata?: CopyObjectRequest['Metadata'];
    serverSideEncryption?: CopyObjectRequest['ServerSideEncryption'];
    SSECustomerAlgorithm?: CopyObjectRequest['SSECustomerAlgorithm'];
    SSECustomerKey?: CopyObjectRequest['SSECustomerKey'];
    SSECustomerKeyMD5?: CopyObjectRequest['SSECustomerKeyMD5'];
    SSEKMSKeyId?: CopyObjectRequest['SSEKMSKeyId'];
};
export declare type S3ProviderCopyOutput = {
    key: string;
};
export declare type PutResult = {
    key: string;
};
export declare type S3ProviderPutOutput<T> = T extends {
    resumable: true;
} ? UploadTask : Promise<PutResult>;
export {};