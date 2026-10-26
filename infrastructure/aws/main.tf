terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws",
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "name" {
  type    = string
  default = "photoforge"
}

variable "web_origin" {
  type = string
}

variable "bucket_name" {
  type = string
}

variable "environment_secret_arn" {
  type = string
}

variable "instance_type" {
  type    = string
  default = "t3.medium"
}

variable "enable_cloudfront" {
  type    = bool
  default = false
}

variable "database_multi_az" {
  type    = bool
  default = false
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_vpc" "main" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.42.1.0/24"
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true
}

resource "aws_subnet" "database" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.42.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "app" {
  name   = "${var.name}-app"
  vpc_id = aws_vpc.main.id
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "database" {
  name   = "${var.name}-database"
  vpc_id = aws_vpc.main.id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
}

resource "aws_db_subnet_group" "main" {
  name       = var.name
  subnet_ids = aws_subnet.database[*].id
}

resource "aws_db_instance" "main" {
  identifier                  = var.name
  engine                      = "postgres"
  engine_version              = "17"
  instance_class              = "db.t4g.micro"
  allocated_storage           = 20
  max_allocated_storage       = 100
  storage_encrypted           = true
  db_name                     = "photoforge"
  username                    = "photoforge_admin"
  manage_master_user_password = true
  db_subnet_group_name        = aws_db_subnet_group.main.name
  vpc_security_group_ids      = [aws_security_group.database.id]
  publicly_accessible         = false
  multi_az                    = var.database_multi_az
  backup_retention_period     = 7
  deletion_protection         = true
  skip_final_snapshot         = false
  final_snapshot_identifier   = "${var.name}-final-snapshot"
  auto_minor_version_upgrade  = true
}

resource "aws_s3_bucket" "assets" {
  bucket        = var.bucket_name
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  cors_rule {
    allowed_origins = [var.web_origin]
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 300
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"
    filter {
      prefix = ""
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_cloudwatch_log_group" "services" {
  name              = "/photoforge/services"
  retention_in_days = 14
}

resource "aws_ecr_repository" "app" {
  name                 = var.name
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_iam_role" "instance" {
  name               = "${var.name}-instance"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17",
    Statement = [{
        Effect    = "Allow",
        Principal = {
          Service = "ec2.amazonaws.com"
        },
        Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "app" {
  role   = aws_iam_role.instance.id
  policy = jsonencode({
    Version   = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = ["s3:GetObject", "s3:PutObject"],
        Resource = ["${aws_s3_bucket.assets.arn}/users/*", "${aws_s3_bucket.assets.arn}/deployment/*"]
      },
      {
        Effect   = "Allow",
        Action   = ["s3:ListBucket"],
        Resource = aws_s3_bucket.assets.arn
      },
      {
        Effect   = "Allow",
        Action   = ["secretsmanager:GetSecretValue"],
        Resource = var.environment_secret_arn
      },
      {
        Effect   = "Allow",
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"],
        Resource = "${aws_cloudwatch_log_group.services.arn}:*"
      },
      {
        Effect   = "Allow",
        Action   = ["ecr:GetAuthorizationToken"],
        Resource = "*"
      },
      {
        Effect   = "Allow",
        Action   = ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"],
        Resource = aws_ecr_repository.app.arn
      }
    ]
  })
}

resource "aws_iam_instance_profile" "app" {
  name = var.name
  role = aws_iam_role.instance.name
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }
  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }
  user_data = <<-BOOT
  #!/bin/bash
  set -eu
  apt-get update
  apt-get install -y docker.io docker-compose-v2 unzip curl
  curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install
  systemctl enable --now docker
  mkdir -p /opt/photoforge
  chmod 700 /opt/photoforge
 BOOT
  tags = {
    Name = var.name
  }
}

resource "aws_eip" "app" {
  domain   = "vpc"
  instance = aws_instance.app.id
}

resource "aws_cloudwatch_metric_alarm" "cpu" {
  alarm_name          = "${var.name}-high-cpu"
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  dimensions          = {
    InstanceId = aws_instance.app.id
  }
}

resource "aws_cloudfront_origin_access_control" "assets" {
  count                             = var.enable_cloudfront ? 1 : 0
  name                              = "${var.name}-public-assets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "assets" {
  count   = var.enable_cloudfront ? 1 : 0
  enabled = true
  origin {
    domain_name              = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_id                = "s3"
    origin_path              = "/public"
    origin_access_control_id = aws_cloudfront_origin_access_control.assets[0].id
  }
  default_cache_behavior {
    target_origin_id       = "s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "cdn" {
  count  = var.enable_cloudfront ? 1 : 0
  bucket = aws_s3_bucket.assets.id
  policy = jsonencode({
    Version   = "2012-10-17",
    Statement = [{
        Effect    = "Allow",
        Principal = {
          Service = "cloudfront.amazonaws.com"
        },
        Action    = "s3:GetObject",
        Resource  = "${aws_s3_bucket.assets.arn}/public/*",
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.assets[0].arn
          }
        }
    }]
  })
}

output "instance_id" {
  value = aws_instance.app.id
}

output "public_ip" {
  value = aws_eip.app.public_ip
}

output "database_endpoint" {
  value = aws_db_instance.main.endpoint
}

output "ecr_repository" {
  value = aws_ecr_repository.app.repository_url
}
