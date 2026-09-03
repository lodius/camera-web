#!/bin/bash

npm run build
sudo cp -r dist/* /var/www/camera/
ls -la /var/www/camera/

