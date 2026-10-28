# Copy to production.tfvars and replace the example values.
# production.tfvars is ignored by Git; never place secret values here.
region                 = "us-east-1"
name                   = "photoforge"
web_origin             = "https://photos.example.com"
bucket_name            = "replace-with-a-globally-unique-photoforge-bucket"
environment_secret_arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:photoforge/production-REPLACE"
instance_type          = "t3.medium"
enable_cloudfront      = false
database_multi_az      = false
